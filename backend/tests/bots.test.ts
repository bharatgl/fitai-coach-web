import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBotUpdate,
  botTemplates,
  buildStudioBotSystemPrompt,
  createBotDocument,
  serializeBot,
} from "../src/domain/bots.js";
import {
  shouldFindCurrentJobs,
  shouldResearchBotMessage,
  shouldReviewLinkedInProfile,
  shouldReviewLocalRepository,
} from "../src/routes/bots.js";
import {
  ResearchDailyLimitError,
  researchUsageWindow,
} from "../src/services/research-usage.js";
import { readFile } from "node:fs/promises";

test("creates independently scoped bots from original Forge Studio templates", () => {
  const createdAt = new Date("2026-08-30T10:00:00.000Z");
  const document = createBotDocument("user-1", {
    templateId: "interview_coach",
    name: "Backend Interview Partner",
  }, createdAt);
  const bot = serializeBot(document);

  assert.equal(bot.name, "Backend Interview Partner");
  assert.equal(bot.vertical, "interview");
  assert.equal(bot.status, "draft");
  assert.match(bot.slug, /^backend-interview-partner-[a-f0-9]{6}$/);
  assert.match(bot.instructions.goal, /one question at a time/i);
  assert.match(bot.instructions.boundaries, /Never invent a vacancy/);
  assert.match(bot.instructions.boundaries, /Never claim an application or form was submitted/);
  assert.match(bot.context.audience, /preparing for a role/);
  assert.equal(bot.voice.turnEagerness, "patient");
  assert.equal(bot.capabilities.webResearch, true);
  assert.equal(bot.createdAt, createdAt.toISOString());
});

test("editing an active bot creates a new unsynced draft without losing its provider identity", () => {
  const document = createBotDocument("user-1", { templateId: "blank" });
  document.status = "active";
  document.providerAgentId = "agent-existing";
  document.lastSyncedAt = new Date("2026-08-30T11:00:00.000Z");

  const updated = applyBotUpdate(document, {
    name: "Career Story Coach",
    description: "Helps candidates turn real work examples into clear career stories.",
  }, new Date("2026-08-30T12:00:00.000Z"));

  assert.equal(updated.status, "draft");
  assert.equal(updated.providerAgentId, "agent-existing");
  assert.equal(updated.lastSyncedAt, null);
  assert.match(updated.slug, /^career-story-coach-/);
});

test("keeps the initial product templates limited to personal specialist use cases", () => {
  assert.deepEqual(botTemplates.map((template) => template.id), [
    "interview_coach",
    "resume_reviewer",
    "fitness_coach",
    "blank",
  ]);
  assert.equal(botTemplates.some((template) => /contact.?center|customer support|crm/i.test(
    `${template.name} ${template.description} ${template.instructions.goal}`,
  )), false);
});

test("gives every Studio agent honest platform awareness outside its configured job", () => {
  const bot = serializeBot(createBotDocument("user-1", {
    templateId: "interview_coach",
  }));
  const prompt = buildStudioBotSystemPrompt(bot);

  assert.match(prompt, /# Host product knowledge — dormant unless explicitly requested/);
  assert.match(prompt, /general platform for configuring, testing, deploying, and operating focused AI agents/);
  assert.match(prompt, /explicit questions about Unified Agents.*are always in scope/);
  assert.match(prompt, /voice never grants publish permission/);
  assert.match(prompt, /corrections as durable constraints/);
  assert.match(prompt, /never default to the most recently discussed project/);
  assert.match(prompt, /Never merge facts across employers/);
  assert.match(prompt, /do not have unrestricted access to the source repository/);
  assert.match(prompt, /Roman-script Hinglish/);
  assert.match(prompt, /You are Interview Coach, the user's configured interview agent/);
  assert.match(prompt, /# Response standard/);
  assert.match(prompt, /executive-grade personal copilot/);
  assert.match(prompt, /If the user dislikes or rejects an answer/);
  assert.match(prompt, /identify the interviewer's real concern/);
  assert.match(prompt, /ready-to-say wording/);
  assert.match(prompt, /Generic advice that could be sent to any user is not acceptable/);

  const evidencePrompt = buildStudioBotSystemPrompt(bot, { includeProductKnowledge: false });
  assert.doesNotMatch(evidencePrompt, /Unified Agents|Agent Studio|ForgeFit|forgefit\.space|Forge Studio/);
  assert.match(evidencePrompt, /latest request and corrections control the active task/);
});

test("detects current-market questions in English and Hindi without researching ordinary practice", () => {
  assert.equal(shouldResearchBotMessage("What is the current salary market for senior frontend engineers in Bengaluru?"), true);
  assert.equal(shouldResearchBotMessage("अभी कंपनियाँ सीनियर फ्रंटएंड इंजीनियर से क्या expect कर रही हैं?"), true);
  assert.equal(shouldResearchBotMessage("Ask me a React rendering question"), false);
});

test("detects direct job searches and contextual application-link follow-ups", () => {
  assert.equal(shouldFindCurrentJobs("Find current senior frontend jobs in Bengaluru"), true);
  assert.equal(shouldFindCurrentJobs("I want to apply for the role, can you give me the links?"), true);
  assert.equal(shouldFindCurrentJobs("Help me prepare a truthful application for this job"), true);
  assert.equal(shouldFindCurrentJobs("Help me apply"), true);
  assert.equal(shouldFindCurrentJobs(
    "Can you find that for me?",
    "These companies are currently hiring for open roles and I can look for application links.",
  ), true);
  assert.equal(shouldFindCurrentJobs("Can you find that for me?", "We were practising a React answer."), false);
  assert.equal(shouldResearchBotMessage("Show me available backend roles with application URLs"), true);
});

test("detects requests that need evidence from the enabled local repository", () => {
  assert.equal(shouldReviewLocalRepository("Inspect my repo and create truthful resume bullets"), true);
  assert.equal(shouldReviewLocalRepository("Explain the project architecture from the source code"), true);
  assert.equal(shouldReviewLocalRepository("Help me improve this interview answer"), false);
});

test("detects LinkedIn profile reviews without treating unrelated mentions as reviews", () => {
  assert.equal(shouldReviewLinkedInProfile("Review and optimize my LinkedIn profile"), true);
  assert.equal(shouldReviewLinkedInProfile("Rewrite my LinkedIn headline and About section"), true);
  assert.equal(shouldReviewLinkedInProfile("I saw that role on LinkedIn"), false);
});

test("uses a UTC daily research window with delayed TTL cleanup", () => {
  const window = researchUsageWindow(new Date("2026-08-31T23:59:59.000Z"));
  assert.equal(window.id, "global:2026-08-31");
  assert.equal(window.date, "2026-08-31");
  assert.equal(window.expiresAt.toISOString(), "2026-09-08T00:00:00.000Z");
});

test("daily research limit errors explain the credit-protection reset", () => {
  const error = new ResearchDailyLimitError(20);
  assert.match(error.message, /20/);
  assert.match(error.message, /00:00 UTC/);
  assert.match(error.message, /protect.*credits/i);
});

test("persists idempotent live bot turns so voice history survives reloads", async () => {
  const [routes, database] = await Promise.all([
    readFile(new URL("../src/routes/bots.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/db.ts", import.meta.url), "utf8"),
  ]);

  assert.match(routes, /post\(\s*"\/v1\/bots\/:botId\/live-turns"/);
  assert.match(routes, /clientTurnId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(routes, /\{ userId: user\.id, botId, clientTurnId, role: "user" \}/);
  assert.match(routes, /\{ userId: user\.id, botId, clientTurnId, role: "assistant" \}/);
  assert.match(database, /\{ userId: 1, botId: 1, clientTurnId: 1, role: 1 \}/);
  assert.match(routes, /await resolveGeminiSettings\(user\.id, database\)/);
  assert.match(routes, /Optional ElevenLabs fallback could not be provisioned/);
  assert.match(routes, /\/v1\/bots\/:botId\/local-repository-review/);
  assert.match(routes, /review_local_repository/);
  assert.match(routes, /liveBotPrompt\(bot, history, false\)/);
  assert.match(routes, /merely asking about their resume, is not permission/);
  assert.match(routes, /current spoken turn is always the highest-priority statement of scope/);
  assert.match(database, /botLocalRepositories/);
});
