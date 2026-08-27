import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  exerciseLibrarySource,
  findExerciseLibraryItem,
  searchExerciseLibrary,
} from "../domain/exercise-library.js";

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

export async function exerciseRoutes(app: FastifyInstance) {
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
