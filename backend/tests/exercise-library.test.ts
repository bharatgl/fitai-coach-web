import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  exerciseLibrary,
  exerciseLibrarySource,
  findExerciseLibraryItem,
  searchExerciseLibrary,
} from "../src/domain/exercise-library.js";
import { exerciseRoutes } from "../src/routes/exercises.js";

test("imports all 1,324 OpenGym source exercises without restricted media", () => {
  assert.equal(exerciseLibrary.length, 1_324);
  assert.equal(new Set(exerciseLibrary.map(({ id }) => id)).size, 1_324);
  assert.equal(exerciseLibrarySource.license, "MIT");

  for (const exercise of exerciseLibrary) {
    assert.match(exercise.id, /^opengym-[A-Za-z0-9_-]+$/);
    assert.ok(exercise.name);
    assert.ok(exercise.instructions.length >= 1);
    assert.equal("image" in exercise, false);
    assert.equal("gifUrl" in exercise, false);
    assert.equal(JSON.stringify(exercise).includes("Gym visual"), false);
  }
});

test("searches, filters, and paginates the exercise library", () => {
  const result = searchExerciseLibrary({
    query: "press",
    bodyPart: "chest",
    equipment: "dumbbell",
    offset: 1,
    limit: 5,
  });

  assert.equal(result.items.length, Math.min(5, Math.max(0, result.total - 1)));
  assert.ok(result.total > 1);
  assert.equal(result.offset, 1);
  assert.equal(result.limit, 5);
  assert.ok(result.items.every((exercise) => exercise.bodyPart === "chest"));
  assert.ok(result.items.every((exercise) => exercise.equipment === "dumbbell"));
  assert.ok(result.filters.equipment.includes("cable"));
});

test("finds one exercise by its namespaced stable ID", () => {
  const exercise = findExerciseLibraryItem("opengym-0001");
  assert.equal(exercise?.sourceId, "0001");
  assert.equal(exercise?.name, "3/4 sit-up");
  assert.equal(findExerciseLibraryItem("missing"), null);
});

test("serves paginated library and detail API responses", async () => {
  const app = Fastify();
  await app.register(exerciseRoutes);

  const listResponse = await app.inject({
    method: "GET",
    url: "/v1/exercises?query=curl&equipment=dumbbell&limit=3",
  });
  assert.equal(listResponse.statusCode, 200);
  const list = listResponse.json();
  assert.equal(list.items.length, 3);
  assert.ok(list.total >= 3);
  assert.ok(list.items.every((exercise: { equipment: string }) => exercise.equipment === "dumbbell"));

  const detailResponse = await app.inject({
    method: "GET",
    url: `/v1/exercises/${list.items[0].id}`,
  });
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailResponse.json().exercise.id, list.items[0].id);

  const missingResponse = await app.inject({
    method: "GET",
    url: "/v1/exercises/opengym-missing",
  });
  assert.equal(missingResponse.statusCode, 404);
  await app.close();
});
