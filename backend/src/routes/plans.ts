import {
  AiProviderError,
  buildDeterministicPlan,
  generateAdaptivePlan,
  planVolumeTargetsFor,
} from "@fitai/ai";
import type { GeneratePlanResponse } from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase, getMongoClient } from "../db.js";
import { availableExercises } from "../domain/exercise-catalog.js";
import {
  materializePlan,
  PlanValidationError,
  resolvePlanStartDate,
  restorePlanVersion,
  serializePlan,
  serializeWorkout,
  type PlannedWorkoutDocument,
  type WorkoutPlanDocument,
} from "../domain/plans.js";
import { serializeProfile } from "../domain/profiles.js";
import { syncAuthenticatedUser } from "../users.js";

const generatePlanInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function planRoutes(app: FastifyInstance) {
  app.post(
    "/v1/plans/generate",
    { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = await authenticate(request);
      const input = generatePlanInput.parse(request.body ?? {});
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const profileDocument = await database
        .collection("profiles")
        .findOne({ userId: user.id }, { projection: { _id: 0 } });

      if (!profileDocument) {
        return reply.code(409).send({ error: "Complete your profile before generating a plan" });
      }

      const profile = serializeProfile(profileDocument);
      const activeWorkout = await database.collection("workoutSessions").findOne(
        { userId: user.id, status: { $in: ["active", "paused"] } },
        { projection: { _id: 1 } },
      );
      if (activeWorkout) {
        return reply.code(409).send({
          error: "Finish or abandon your active workout before generating a new plan",
        });
      }
      const exercises = availableExercises(profile.equipment, profile.experienceLevel);
      const volumeTargets = planVolumeTargetsFor(profile);
      if (exercises.length < volumeTargets.minExercisesPerSession) {
        return reply.code(422).send({
          error: profile.experienceLevel === "advanced"
            ? `Your equipment setup only supports ${exercises.length} advanced working exercises, but this ${profile.preferredSessionMinutes}-minute plan needs at least ${volumeTargets.minExercisesPerSession}. Update Available equipment (for example, “commercial gym”) and rebuild.`
            : "Not enough compatible exercises are available for this profile",
        });
      }

      const locks = database.collection("planGenerationLocks");
      const now = new Date();
      await locks.deleteOne({ userId: user.id, expiresAt: { $lte: now } });
      try {
        await locks.insertOne({
          userId: user.id,
          acquiredAt: now,
          expiresAt: new Date(now.getTime() + 2 * 60_000),
        });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          return reply.code(409).send({ error: "A plan is already being generated" });
        }
        throw error;
      }

      try {
        const config = getConfig();
        let generationModel = config.GEMINI_MODEL;
        let draft;
        try {
          draft = await generateAdaptivePlan({
            apiKey: config.GEMINI_API_KEY,
            model: config.GEMINI_MODEL,
            profile,
            exercises,
          });
        } catch (error) {
          if (!(error instanceof AiProviderError)) throw error;
          request.log.warn(
            { reason: error.reason, error: error.message },
            "AI plan generation failed; using the validated local planner",
          );
          draft = buildDeterministicPlan(profile, exercises);
          generationModel = `local-fallback:${error.reason}`;
        }
        const latestPlan = await database
          .collection<WorkoutPlanDocument>("workoutPlans")
          .findOne(
            { userId: user.id },
            { projection: { _id: 0 }, sort: { version: -1 } },
          );
        const startDate = resolvePlanStartDate(input.startDate);

        let generated;
        try {
          generated = materializePlan({
            draft,
            profile,
            catalog: exercises,
            userId: user.id,
            version: (latestPlan?.version ?? 0) + 1,
            model: generationModel,
            startDate,
          });
        } catch (error) {
          if (error instanceof PlanValidationError) {
            request.log.warn({ error: error.message }, "Generated plan failed validation");
            draft = buildDeterministicPlan(profile, exercises);
            generationModel = "local-fallback:validation";
            generated = materializePlan({
              draft,
              profile,
              catalog: exercises,
              userId: user.id,
              version: (latestPlan?.version ?? 0) + 1,
              model: generationModel,
              startDate,
            });
          } else {
            throw error;
          }
        }

        const client = await getMongoClient();
        await client.withSession(async (session) => {
          await session.withTransaction(async () => {
            await database
              .collection<WorkoutPlanDocument>("workoutPlans")
              .updateMany(
                { userId: user.id, status: "active" },
                { $set: { status: "archived" } },
                { session },
              );
            await database
              .collection<PlannedWorkoutDocument>("plannedWorkouts")
              .updateMany(
                { userId: user.id, status: "planned" },
                { $set: { status: "skipped" } },
                { session },
              );
            await database
              .collection<WorkoutPlanDocument>("workoutPlans")
              .insertOne(generated.plan, { session });
            await database
              .collection<PlannedWorkoutDocument>("plannedWorkouts")
              .insertMany(generated.workouts, { session });
          });
        });

        const response: GeneratePlanResponse = {
          plan: serializePlan(generated.plan),
          workouts: generated.workouts.map(serializeWorkout),
        };
        return reply.code(201).send(response);
      } finally {
        await locks.deleteOne({ userId: user.id });
      }
    },
  );

  app.post(
    "/v1/plans/:id/restore",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const activeWorkout = await database.collection("workoutSessions").findOne(
        { userId: user.id, status: { $in: ["active", "paused"] } },
        { projection: { _id: 1 } },
      );
      if (activeWorkout) {
        return reply.code(409).send({
          error: "Finish or abandon your active workout before restoring a plan",
        });
      }

      const sourcePlan = await database
        .collection<WorkoutPlanDocument>("workoutPlans")
        .findOne({ id, userId: user.id }, { projection: { _id: 0 } });
      if (!sourcePlan) {
        return reply.code(404).send({ error: "Plan version not found" });
      }
      const sourceWorkouts = await database
        .collection<PlannedWorkoutDocument>("plannedWorkouts")
        .find({ planId: id, userId: user.id }, { projection: { _id: 0 } })
        .sort({ weekNumber: 1, dayOffset: 1 })
        .toArray();
      const latestPlan = await database
        .collection<WorkoutPlanDocument>("workoutPlans")
        .findOne(
          { userId: user.id },
          { projection: { _id: 0 }, sort: { version: -1 } },
        );

      let restored;
      try {
        restored = restorePlanVersion({
          sourcePlan,
          sourceWorkouts,
          userId: user.id,
          version: (latestPlan?.version ?? 0) + 1,
          startDate: resolvePlanStartDate(undefined),
        });
      } catch (error) {
        if (error instanceof PlanValidationError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }

      const client = await getMongoClient();
      await client.withSession(async (session) => {
        await session.withTransaction(async () => {
          await database
            .collection<WorkoutPlanDocument>("workoutPlans")
            .updateMany(
              { userId: user.id, status: "active" },
              { $set: { status: "archived" } },
              { session },
            );
          await database
            .collection<PlannedWorkoutDocument>("plannedWorkouts")
            .updateMany(
              { userId: user.id, status: "planned" },
              { $set: { status: "skipped" } },
              { session },
            );
          await database
            .collection<WorkoutPlanDocument>("workoutPlans")
            .insertOne(restored.plan, { session });
          await database
            .collection<PlannedWorkoutDocument>("plannedWorkouts")
            .insertMany(restored.workouts, { session });
        });
      });

      const response: GeneratePlanResponse = {
        plan: serializePlan(restored.plan),
        workouts: restored.workouts.map(serializeWorkout),
      };
      return reply.code(201).send(response);
    },
  );
}
