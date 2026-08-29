import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  exerciseLibrarySource,
  findExerciseLibraryItem,
  searchExerciseLibrary,
} from "../domain/exercise-library.js";
import { searchExerciseDemos } from "../domain/exercise-demos.js";

const listQuery = z.object({
  query: z.string().trim().max(100).optional(),
  bodyPart: z.string().trim().max(60).optional(),
  equipment: z.string().trim().max(60).optional(),
  target: z.string().trim().max(60).optional(),
  offset: z.coerce.number().int().min(0).max(1_323).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const itemParams = z.object({
  id: z.string().trim().min(1).max(40),
});

const demosQuery = listQuery.omit({ target: true }).extend({
  offset: z.coerce.number().int().min(0).max(302).default(0),
});

export async function exerciseRoutes(app: FastifyInstance) {
  app.get("/v1/exercise-demos", async (request, reply) => {
    return reply
      .header("cache-control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400")
      .send(searchExerciseDemos(demosQuery.parse(request.query)));
  });

  app.get("/v1/exercises", async (request) => {
    return searchExerciseLibrary(listQuery.parse(request.query));
  });

  app.get("/v1/exercises/:id", async (request, reply) => {
    const { id } = itemParams.parse(request.params);
    const exercise = findExerciseLibraryItem(id);
    if (!exercise) return reply.code(404).send({ error: "Exercise not found" });
    return { exercise, source: exerciseLibrarySource };
  });
}
