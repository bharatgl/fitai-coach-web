import type {
  ChangeWorkoutStatusRequest,
  FinishWorkoutRequest,
  LogWorkoutSetRequest,
  StartWorkoutResponse,
  SubstituteExerciseRequest,
  WorkoutSessionResponse,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { MongoServerError, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getDatabase, getMongoClient } from "../db.js";
import { availableExercises } from "../domain/exercise-catalog.js";
import type { PlannedWorkoutDocument } from "../domain/plans.js";
import { serializeProfile } from "../domain/profiles.js";
import {
  abandonWorkoutSession,
  calculateWorkoutProgress,
  changeWorkoutStatus,
  chooseSubstitute,
  createWorkoutSession,
  finishWorkoutSession,
  logWorkoutSet,
  recommendedLoadAdjustment,
  serializeWorkoutSession,
  substituteWorkoutExercise,
  WorkoutStateError,
  type WorkoutSessionDocument,
} from "../domain/workouts.js";
import { syncAuthenticatedUser } from "../users.js";

const idParams = z.object({ id: z.uuid() });
const statusInput = z.object({ action: z.enum(["pause", "resume"]) });
const setInput = z.object({
  exerciseId: z.string().trim().min(1).max(120),
  reps: z.number().int().min(1).max(100),
  loadKg: z.number().min(0).max(1_000),
  effortRpe: z.number().int().min(1).max(10),
});
const substitutionInput = z.object({
  exerciseId: z.string().trim().min(1).max(120),
});
const finishInput = z.object({
  reflection: z.string().trim().max(2_000),
  perceivedEffort: z.number().int().min(1).max(10),
});
const abandonInput = z.object({
  reflection: z.string().trim().max(2_000).default(""),
});

async function findSession(database: Db, id: string, userId: string) {
  const session = await database
    .collection<WorkoutSessionDocument>("workoutSessions")
    .findOne({ id, userId }, { projection: { _id: 0 } });
  if (!session) throw new WorkoutStateError("Workout session not found", 404);
  return session;
}

async function replaceSession(
  database: Db,
  current: WorkoutSessionDocument,
  next: WorkoutSessionDocument,
  mongoSession?: ClientSession,
) {
  const result = await database
    .collection<WorkoutSessionDocument>("workoutSessions")
    .replaceOne(
      { id: current.id, userId: current.userId, version: current.version },
      next,
      { session: mongoSession },
    );
  if (result.modifiedCount !== 1) {
    throw new WorkoutStateError(
      "The workout changed in another request. Refresh and try again.",
    );
  }
  return next;
}

export async function workoutRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/v1/workouts/:id/start",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const sessions = database.collection<WorkoutSessionDocument>("workoutSessions");
      const existing = await sessions.findOne(
        { userId: user.id, plannedWorkoutId: id },
        { projection: { _id: 0 } },
      );
      if (existing) {
        if (existing.status === "completed" || existing.status === "abandoned") {
          throw new WorkoutStateError("This workout already has a closed session");
        }
        const response: StartWorkoutResponse = {
          session: serializeWorkoutSession(existing),
        };
        return reply.code(200).send(response);
      }

      const activeForAnotherWorkout = await sessions.findOne(
        { userId: user.id, status: { $in: ["active", "paused"] } },
        { projection: { _id: 0, plannedWorkoutId: 1 } },
      );
      if (activeForAnotherWorkout) {
        throw new WorkoutStateError(
          "Finish or abandon your current workout before starting another one",
        );
      }

      const workout = await database
        .collection<PlannedWorkoutDocument>("plannedWorkouts")
        .findOne({ id, userId: user.id }, { projection: { _id: 0 } });
      if (!workout) throw new WorkoutStateError("Planned workout not found", 404);
      const created = createWorkoutSession(workout, user.id);
      const client = await getMongoClient();

      try {
        await client.withSession(async (mongoSession) => {
          await mongoSession.withTransaction(async () => {
            await sessions.insertOne(created, { session: mongoSession });
            const updated = await database
              .collection<PlannedWorkoutDocument>("plannedWorkouts")
              .updateOne(
                { id, userId: user.id, status: { $in: ["planned", "in_progress"] } },
                { $set: { status: "in_progress" } },
                { session: mongoSession },
              );
            if (updated.matchedCount !== 1) {
              throw new WorkoutStateError("This planned workout cannot be started");
            }
          });
        });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          const raced = await sessions.findOne(
            { userId: user.id, plannedWorkoutId: id },
            { projection: { _id: 0 } },
          );
          if (raced) {
            return reply.code(200).send({
              session: serializeWorkoutSession(raced),
            } satisfies StartWorkoutResponse);
          }
          const otherActive = await sessions.findOne(
            { userId: user.id, status: { $in: ["active", "paused"] } },
            { projection: { _id: 0, id: 1 } },
          );
          if (otherActive) {
            throw new WorkoutStateError(
              "Finish or abandon your current workout before starting another one",
            );
          }
        }
        throw error;
      }

      return reply.code(201).send({
        session: serializeWorkoutSession(created),
      } satisfies StartWorkoutResponse);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/workout-sessions/:id",
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const database = await getDatabase();
      return { session: serializeWorkoutSession(await findSession(database, id, user.id)) };
    },
  );

  app.patch<{ Params: { id: string }; Body: ChangeWorkoutStatusRequest }>(
    "/v1/workout-sessions/:id/status",
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = statusInput.parse(request.body);
      const database = await getDatabase();
      const current = await findSession(database, id, user.id);
      const next = changeWorkoutStatus(current, input.action);
      return { session: serializeWorkoutSession(await replaceSession(database, current, next)) };
    },
  );

  app.post<{ Params: { id: string }; Body: LogWorkoutSetRequest }>(
    "/v1/workout-sessions/:id/sets",
    { config: { rateLimit: { max: 90, timeWindow: "1 minute" } } },
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = setInput.parse(request.body);
      const database = await getDatabase();
      const current = await findSession(database, id, user.id);
      const next = logWorkoutSet(current, input);
      return { session: serializeWorkoutSession(await replaceSession(database, current, next)) };
    },
  );

  app.post<{ Params: { id: string }; Body: SubstituteExerciseRequest }>(
    "/v1/workout-sessions/:id/substitutions",
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = substitutionInput.parse(request.body);
      const database = await getDatabase();
      const [current, profileDocument] = await Promise.all([
        findSession(database, id, user.id),
        database.collection("profiles").findOne(
          { userId: user.id },
          { projection: { _id: 0 } },
        ),
      ]);
      if (!profileDocument) {
        throw new WorkoutStateError("Complete your profile before substituting exercises");
      }
      const profile = serializeProfile(profileDocument);
      const catalog = availableExercises(profile.equipment, profile.experienceLevel);
      const replacement = chooseSubstitute(current, input.exerciseId, catalog);
      const next = substituteWorkoutExercise(current, input.exerciseId, replacement);
      return { session: serializeWorkoutSession(await replaceSession(database, current, next)) };
    },
  );

  app.post<{ Params: { id: string }; Body: FinishWorkoutRequest }>(
    "/v1/workout-sessions/:id/finish",
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = finishInput.parse(request.body);
      const database = await getDatabase();
      const client = await getMongoClient();
      let finished: WorkoutSessionDocument | undefined;

      await client.withSession(async (mongoSession) => {
        await mongoSession.withTransaction(async () => {
          const current = await database
            .collection<WorkoutSessionDocument>("workoutSessions")
            .findOne({ id, userId: user.id }, { projection: { _id: 0 }, session: mongoSession });
          if (!current) throw new WorkoutStateError("Workout session not found", 404);
          finished = finishWorkoutSession(current, input);
          await replaceSession(database, current, finished, mongoSession);
          await database.collection<PlannedWorkoutDocument>("plannedWorkouts").updateOne(
            { id: current.plannedWorkoutId, userId: user.id },
            { $set: { status: "completed" } },
            { session: mongoSession },
          );

          const completedSessions = await database
            .collection<WorkoutSessionDocument>("workoutSessions")
            .find(
              { userId: user.id, status: "completed" },
              { projection: { _id: 0 }, session: mongoSession },
            )
            .toArray();
          for (const exercise of finished.exercises) {
            const adjustment = recommendedLoadAdjustment(
              completedSessions,
              exercise.exerciseId,
            );
            await database.collection("plannedWorkouts").updateMany(
              {
                userId: user.id,
                status: "planned",
                scheduledFor: { $gt: current.scheduledFor },
                "exercises.exerciseId": exercise.exerciseId,
              },
              { $set: { "exercises.$[exercise].loadAdjustmentPercent": adjustment } },
              {
                session: mongoSession,
                arrayFilters: [{ "exercise.exerciseId": exercise.exerciseId }],
              },
            );
          }
        });
      });

      if (!finished) throw new WorkoutStateError("Workout could not be finished");
      return { session: serializeWorkoutSession(finished) };
    },
  );

  app.post<{ Params: { id: string }; Body: { reflection?: string } }>(
    "/v1/workout-sessions/:id/abandon",
    async (request): Promise<WorkoutSessionResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = abandonInput.parse(request.body ?? {});
      const database = await getDatabase();
      const client = await getMongoClient();
      let abandoned: WorkoutSessionDocument | undefined;

      await client.withSession(async (mongoSession) => {
        await mongoSession.withTransaction(async () => {
          const current = await database
            .collection<WorkoutSessionDocument>("workoutSessions")
            .findOne({ id, userId: user.id }, { projection: { _id: 0 }, session: mongoSession });
          if (!current) throw new WorkoutStateError("Workout session not found", 404);
          abandoned = abandonWorkoutSession(current, input.reflection);
          await replaceSession(database, current, abandoned, mongoSession);
          await database.collection<PlannedWorkoutDocument>("plannedWorkouts").updateOne(
            { id: current.plannedWorkoutId, userId: user.id },
            { $set: { status: "skipped" } },
            { session: mongoSession },
          );
        });
      });

      if (!abandoned) throw new WorkoutStateError("Workout could not be abandoned");
      return { session: serializeWorkoutSession(abandoned) };
    },
  );

  app.get("/v1/workout-progress", async (request) => {
    const user = await authenticate(request);
    const database = await getDatabase();
    const sessions = await database
      .collection<WorkoutSessionDocument>("workoutSessions")
      .find({ userId: user.id }, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .toArray();
    return { progress: calculateWorkoutProgress(sessions) };
  });
}
