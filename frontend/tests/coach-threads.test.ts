import assert from "node:assert/strict";
import test from "node:test";
import type { CoachThread } from "@fitai/contracts";
import { mostRecentActiveCoachThread } from "../lib/coach-threads.js";

function thread(overrides: Partial<CoachThread> & Pick<CoachThread, "id">): CoachThread {
  return {
    id: overrides.id,
    scope: overrides.scope ?? "general",
    title: overrides.title ?? "Coach",
    pinned: overrides.pinned ?? false,
    archived: overrides.archived ?? false,
    createdAt: overrides.createdAt ?? "2026-08-28T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-28T08:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? null,
    messageCount: overrides.messageCount ?? 0,
  };
}

test("selects the latest conversation instead of the first or pinned conversation", () => {
  const selected = mostRecentActiveCoachThread([
    thread({
      id: "old-pinned",
      pinned: true,
      lastMessageAt: "2026-08-28T10:00:00.000Z",
    }),
    thread({
      id: "latest",
      lastMessageAt: "2026-08-30T04:45:00.000Z",
    }),
  ], "general");

  assert.equal(selected?.id, "latest");
});

test("uses creation time for a new conversation without messages", () => {
  const selected = mostRecentActiveCoachThread([
    thread({ id: "older", lastMessageAt: "2026-08-29T10:00:00.000Z" }),
    thread({ id: "new-empty", createdAt: "2026-08-30T04:50:00.000Z" }),
  ], "general");

  assert.equal(selected?.id, "new-empty");
});

test("ignores archived conversations and other scopes", () => {
  const selected = mostRecentActiveCoachThread([
    thread({ id: "archived", archived: true, lastMessageAt: "2026-08-30T05:00:00.000Z" }),
    thread({ id: "plan", scope: "plan", lastMessageAt: "2026-08-30T04:59:00.000Z" }),
    thread({ id: "general", lastMessageAt: "2026-08-30T04:58:00.000Z" }),
  ], "general");

  assert.equal(selected?.id, "general");
});
