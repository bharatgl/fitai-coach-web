import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getDatabase } from "../db.js";
import { serializeProfile } from "../domain/profiles.js";
import { syncAuthenticatedUser } from "../users.js";

const profileInput = z.object({
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  gender: z.enum(["woman", "man", "non_binary", "prefer_not_to_say"]),
  age: z.number().int().min(13).max(100).nullable(),
  heightCm: z.number().min(100).max(250).nullable(),
  weightKg: z.number().min(30).max(350).nullable(),
  dietaryPreference: z.enum([
    "vegetarian",
    "non_vegetarian",
    "vegan",
    "eggetarian",
    "no_preference",
  ]),
  primaryGoal: z.string().trim().min(2).max(120),
  trainingPhase: z.enum(["cut", "bulk", "recomposition", "general"]),
  programDurationWeeks: z.union([z.literal(4), z.literal(8), z.literal(12)]),
  equipment: z.array(z.string().trim().min(1).max(60)).max(30),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  preferredSessionMinutes: z.number().int().min(10).max(180),
  movementNotes: z.string().trim().max(2_000),
  bodyConsiderations: z.string().trim().max(2_000),
});

export async function profileRoutes(app: FastifyInstance) {
  app.get("/v1/profile", async (request) => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const profile = await database
      .collection("profiles")
      .findOne({ userId: user.id }, { projection: { _id: 0 } });

    return { profile: profile ? serializeProfile(profile) : null };
  });

  app.put("/v1/profile", async (request, reply) => {
    const user = await authenticate(request);
    const input = profileInput.parse(request.body);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const now = new Date();

    await database.collection("profiles").updateOne(
      { userId: user.id },
      {
        $set: {
          ...input,
          email: user.email,
          displayName: user.name,
          updatedAt: now,
        },
        $setOnInsert: {
          userId: user.id,
          createdAt: now,
          onboardingCompletedAt: now,
        },
      },
      { upsert: true },
    );

    const profile = await database
      .collection("profiles")
      .findOne({ userId: user.id }, { projection: { _id: 0 } });
    return reply.code(200).send({
      profile: profile ? serializeProfile(profile) : null,
    });
  });
}
