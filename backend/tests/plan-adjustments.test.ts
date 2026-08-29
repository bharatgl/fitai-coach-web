import assert from "node:assert/strict";
import test from "node:test";
import type { PlannedWorkoutDocument, WorkoutPlanDocument } from "../src/domain/plans.js";
import {
  createPlanAdjustmentProposal,
  serializePlanAdjustmentProposal,
} from "../src/domain/plan-adjustments.js";

const plan = {
  id: "plan-1",
  userId: "user-1",
  version: 3,
  revision: 0,
  status: "active",
  startDate: new Date("2026-08-28T00:00:00.000Z"),
} as WorkoutPlanDocument;

function workout(id: string, name: string, date: string, dayOffset: number): PlannedWorkoutDocument {
  return {
    id,
    name,
    userId: "user-1",
    planId: "plan-1",
    weekNumber: 1,
    dayOffset,
    scheduledFor: new Date(`${date}T00:00:00.000Z`),
    status: "planned",
  } as PlannedWorkoutDocument;
}

const workouts = [
  workout("push-1", "Push", "2026-08-28", 0),
  workout("pull-1", "Pull", "2026-08-29", 1),
  workout("legs-1", "Legs", "2026-08-30", 2),
];

test("creates an exact pending proposal for reported Thursday and Friday training", () => {
  const proposal = createPlanAdjustmentProposal({
    draft: {
      action: "move_workouts",
      moves: [
        { workoutId: "push-1", scheduledFor: "2026-08-27" },
        { workoutId: "pull-1", scheduledFor: "2026-08-28" },
      ],
      newStartDate: null,
      rationale: "Reflect the member's actual chest and back training days.",
    },
    plan,
    workouts,
    userId: "user-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    now: new Date("2026-08-28T12:00:00.000Z"),
  });

  assert.equal(proposal.basePlanRevision, 0);
  assert.deepEqual(proposal.changes.map(({ workoutId, before, after }) => ({ workoutId, before, after })), [
    { workoutId: "push-1", before: "2026-08-28", after: "2026-08-27" },
    { workoutId: "pull-1", before: "2026-08-29", after: "2026-08-28" },
  ]);
  assert.equal(
    serializePlanAdjustmentProposal(proposal, new Date("2026-08-28T12:00:00.000Z")).status,
    "pending",
  );
});

test("rejects a partial move that collides with another workout", () => {
  assert.throws(() => createPlanAdjustmentProposal({
    draft: {
      action: "move_workouts",
      moves: [{ workoutId: "pull-1", scheduledFor: "2026-08-28" }],
      newStartDate: null,
      rationale: "Move back training to Friday.",
    },
    plan,
    workouts,
    userId: "user-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
  }), /two workouts on the same date/);
});

test("rejects unknown and completed workouts", () => {
  assert.throws(() => createPlanAdjustmentProposal({
    draft: {
      action: "move_workouts",
      moves: [{ workoutId: "unknown", scheduledFor: "2026-08-27" }],
      newStartDate: null,
      rationale: "Move it.",
    },
    plan,
    workouts,
    userId: "user-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
  }), /unavailable workout/);

  assert.throws(() => createPlanAdjustmentProposal({
    draft: {
      action: "move_workouts",
      moves: [{ workoutId: "push-1", scheduledFor: "2026-08-27" }],
      newStartDate: null,
      rationale: "Move it.",
    },
    plan,
    workouts: [{ ...workouts[0]!, status: "completed" }, workouts[1]!, workouts[2]!],
    userId: "user-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
  }), /can no longer be moved/);
});
