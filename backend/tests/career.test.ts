import assert from "node:assert/strict";
import test from "node:test";
import type { CareerInterviewFeedback, CareerInterviewTurn } from "@fitai/contracts";
import {
  abandonCareerInterview,
  assertCareerApplicationTransition,
  careerNextAction,
  completeCareerInterview,
  createCareerApplicationDocument,
  createCareerInterviewDocument,
  createCareerProfileDocument,
  groundInterviewFeedback,
  serializeCareerApplication,
  serializeCareerInterview,
  serializeCareerProfile,
} from "../src/domain/career.js";

const now = new Date("2026-09-02T10:00:00.000Z");

test("serializes career records without leaking tenant ownership", () => {
  const profile = createCareerProfileDocument("user-secret", {
    headline: "Staff frontend engineer", location: "Bengaluru", workMode: "remote",
    yearsExperience: 11, skills: ["TypeScript"], strengths: "Real-time product systems", constraints: "Remote only",
  }, null, now);
  const application = createCareerApplicationDocument("user-secret", {
    targetRoleId: null, company: "Example", roleTitle: "Staff engineer", sourceUrl: null,
    status: "saved", nextAction: "Review", nextActionDue: null, notes: "",
  }, now);
  assert.equal("userId" in serializeCareerProfile(profile), false);
  assert.equal("userId" in serializeCareerApplication(application), false);
});

test("enforces a deliberate application lifecycle", () => {
  assert.doesNotThrow(() => assertCareerApplicationTransition("saved", "preparing"));
  assert.doesNotThrow(() => assertCareerApplicationTransition("interviewing", "offer"));
  assert.throws(() => assertCareerApplicationTransition("saved", "accepted"), /cannot move/);
  assert.throws(() => assertCareerApplicationTransition("accepted", "applied"), /cannot move/);
});

test("grounds interview evidence only in candidate answers", () => {
  const turns: CareerInterviewTurn[] = [
    { role: "coach", content: "What changed because of your work?" },
    { role: "user", content: "I reduced interaction latency from 400ms to 120ms by moving aggregation off the render path." },
  ];
  const feedback = groundInterviewFeedback({
    overallScore: 4,
    summary: "Specific and defensible.",
    rubric: [
      { competency: "impact", score: 5, evidenceExcerpt: "reduced interaction latency from 400ms to 120ms", feedback: "Quantified." },
      { competency: "leadership", score: 3, evidenceExcerpt: "I led twelve engineers", feedback: "Unsupported." },
    ],
    nextActions: ["Explain the trade-off."],
  }, turns);
  assert.equal(feedback.rubric[0]?.evidenceExcerpt, "reduced interaction latency from 400ms to 120ms");
  assert.equal(feedback.rubric[1]?.evidenceExcerpt, null);
  assert.equal(feedback.groundedEvidenceCount, 1);
});

test("closes interview sessions immutably and clears the active slot", () => {
  const input = { targetRoleId: null, botId: null, format: "behavioral" as const, competencies: ["impact"], plannedMinutes: 20 };
  const active = createCareerInterviewDocument("u1", input, now);
  const turns: CareerInterviewTurn[] = [{ role: "coach", content: "Question" }, { role: "user", content: "Answer" }];
  const feedback: CareerInterviewFeedback = { overallScore: 3, summary: "Baseline", rubric: [], nextActions: [], groundedEvidenceCount: 0 };
  const completed = completeCareerInterview(active, turns, feedback, "model", new Date(now.getTime() + 1_000));
  assert.equal(active.status, "active");
  assert.equal(completed.status, "completed");
  assert.equal(completed.activeSlot, null);
  assert.equal(serializeCareerInterview(completed).turns.length, 2);
  assert.throws(() => abandonCareerInterview(completed), /already closed/);
});

test("chooses a next action from durable journey state", () => {
  assert.equal(careerNextAction({ hasProfile: false, targetCount: 0, applicationCounts: {}, completedInterviews: 0 }), "complete_profile");
  assert.equal(careerNextAction({ hasProfile: true, targetCount: 0, applicationCounts: {}, completedInterviews: 0 }), "choose_target");
  assert.equal(careerNextAction({ hasProfile: true, targetCount: 1, applicationCounts: { preparing: 1 }, completedInterviews: 0 }), "prepare_application");
  assert.equal(careerNextAction({ hasProfile: true, targetCount: 1, applicationCounts: { applied: 1 }, completedInterviews: 0 }), "practice_interview");
});
