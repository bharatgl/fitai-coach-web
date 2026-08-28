#!/usr/bin/env node
/**
 * Summarizes `ai.run` log lines into a per-feature, per-model report.
 *
 * Run records are emitted as structured log lines rather than stored in a
 * database, so this script is the query layer. It reads NDJSON from files or
 * stdin and ignores every line that is not an ai.run record, which means it can
 * be pointed straight at raw container logs.
 *
 *   docker logs fitai-backend 2>&1 | node scripts/ai-runs-report.mjs
 *   node scripts/ai-runs-report.mjs backend.log --since 2026-08-01
 *   node scripts/ai-runs-report.mjs backend.log --json
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sinceIndex = args.indexOf("--since");
const since = sinceIndex === -1 ? null : Date.parse(args[sinceIndex + 1] ?? "");
// Skip both the flag and the value it consumes, so a date is not read as a path.
const sinceValueIndex = sinceIndex === -1 ? -1 : sinceIndex + 1;
const files = args.filter(
  (arg, index) => !arg.startsWith("--") && index !== sinceValueIndex,
);

if (sinceIndex !== -1 && Number.isNaN(since)) {
  console.error("--since needs a parseable date, for example 2026-08-01");
  process.exit(1);
}

function emptyBucket() {
  return {
    calls: 0,
    ok: 0,
    failed: 0,
    reasons: {},
    promptTokens: 0,
    cachedPromptTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    durations: [],
  };
}

const byKey = new Map();

function record(run) {
  if (since && Date.parse(run.startedAt) < since) return;

  const key = `${run.feature}\u0000${run.model}`;
  let bucket = byKey.get(key);
  if (!bucket) {
    bucket = { feature: run.feature, model: run.model, ...emptyBucket() };
    byKey.set(key, bucket);
  }

  bucket.calls += 1;
  bucket[run.outcome === "ok" ? "ok" : "failed"] += 1;
  if (run.errorReason) {
    bucket.reasons[run.errorReason] = (bucket.reasons[run.errorReason] ?? 0) + 1;
  }
  if (typeof run.durationMs === "number") bucket.durations.push(run.durationMs);
  if (run.usage) {
    bucket.promptTokens += run.usage.promptTokens ?? 0;
    bucket.cachedPromptTokens += run.usage.cachedPromptTokens ?? 0;
    // Reasoning tokens bill as output, so they belong in the same column.
    bucket.outputTokens += (run.usage.outputTokens ?? 0) + (run.usage.thoughtTokens ?? 0);
  }
  if (typeof run.costMicroUsd === "number") {
    bucket.costMicroUsd += run.costMicroUsd;
    bucket.pricedCalls += 1;
  } else {
    bucket.unpricedCalls += 1;
  }
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const rank = Math.ceil(sorted.length * fraction);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

async function readLines(stream) {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    // Container logs interleave plain text with JSON; skip anything else quietly.
    const start = line.indexOf("{");
    if (start === -1) continue;
    try {
      const parsed = JSON.parse(line.slice(start));
      const run = parsed.ai ?? parsed;
      if (typeof run?.schema === "string" && run.schema.startsWith("ai.run/")) {
        record(run);
      }
    } catch {
      continue;
    }
  }
}

for (const file of files.length ? files : [null]) {
  await readLines(file ? createReadStream(file) : process.stdin);
}

const rows = [...byKey.values()]
  .map((bucket) => {
    const sorted = [...bucket.durations].sort((a, b) => a - b);
    return {
      feature: bucket.feature,
      model: bucket.model,
      calls: bucket.calls,
      ok: bucket.ok,
      failed: bucket.failed,
      failureRate: bucket.calls ? bucket.failed / bucket.calls : 0,
      reasons: bucket.reasons,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      promptTokens: bucket.promptTokens,
      cachedPromptTokens: bucket.cachedPromptTokens,
      outputTokens: bucket.outputTokens,
      // Null rather than zero when nothing in this bucket had a known price:
      // an unpriced model is unknown, not free.
      costUsd: bucket.pricedCalls ? bucket.costMicroUsd / 1_000_000 : null,
      // Cost per call that actually produced a usable result. A cheap model that
      // fails often is not cheap.
      costPerOkUsd: bucket.pricedCalls && bucket.ok
        ? bucket.costMicroUsd / bucket.ok / 1_000_000
        : null,
      unpricedCalls: bucket.unpricedCalls,
    };
  })
  .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.calls - a.calls);

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (!rows.length) {
  console.log("No ai.run records found.");
  process.exit(0);
}

const columns = [
  { header: "feature", width: 8, align: "start" },
  { header: "model", width: 26, align: "start" },
  { header: "calls", width: 7 },
  { header: "fail%", width: 7 },
  { header: "p50ms", width: 8 },
  { header: "p95ms", width: 8 },
  { header: "in", width: 10 },
  { header: "cached", width: 10 },
  { header: "out", width: 10 },
  { header: "cost", width: 12 },
  { header: "cost/ok", width: 12 },
];

function line(values) {
  return values
    .map((value, index) => {
      const { width, align } = columns[index];
      const text = String(value);
      return align === "start" ? text.padEnd(width) : text.padStart(width);
    })
    .join(" ");
}

const usd = (value) => (value === null ? "n/a" : `$${value.toFixed(6)}`);

console.log(line(columns.map((column) => column.header)));
for (const row of rows) {
  console.log(line([
    row.feature,
    row.model,
    row.calls,
    `${(row.failureRate * 100).toFixed(1)}%`,
    row.p50Ms,
    row.p95Ms,
    row.promptTokens,
    row.cachedPromptTokens,
    row.outputTokens,
    usd(row.costUsd),
    usd(row.costPerOkUsd),
  ]));

  const reasons = Object.entries(row.reasons);
  if (reasons.length) {
    const detail = reasons.map(([reason, count]) => `${reason}=${count}`).join(", ");
    console.log(`${" ".repeat(9)}failures: ${detail}`);
  }
  if (row.unpricedCalls) {
    console.log(
      `${" ".repeat(9)}${row.unpricedCalls} call(s) unpriced; add "${row.model}" to ai/src/pricing.ts`,
    );
  }
}

const totalCost = rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0);
const unpriced = rows.reduce((sum, row) => sum + row.unpricedCalls, 0);
console.log(
  `\nTotal: $${totalCost.toFixed(4)} across ${totalCalls} calls`
  + (unpriced ? ` (${unpriced} unpriced, excluded from the total)` : ""),
);
