#!/usr/bin/env node
/**
 * Attributes AI spend from `ai.run` log lines.
 *
 * Run records are emitted as structured log lines rather than stored in a
 * database, so this script is the query layer. It reads NDJSON from files or
 * stdin and ignores every line that is not an ai.run record, which means it can
 * be pointed straight at raw container logs.
 *
 *   docker logs fitai-backend 2>&1 | node scripts/ai-runs-report.mjs
 *   gcloud logging read 'jsonPayload.message="ai.run"' --format=json \
 *     | jq -c '.[]' | node scripts/ai-runs-report.mjs --by user
 *   node scripts/ai-runs-report.mjs backend.log --by feature
 *   node scripts/ai-runs-report.mjs backend.log --by user --top 20
 *   node scripts/ai-runs-report.mjs backend.log --by day,feature --since 2026-08-01
 *   node scripts/ai-runs-report.mjs backend.log --csv > spend.csv
 *
 * `user` groups by `userRef`, the salted pseudonym written to the logs. It is
 * stable per member, so per-user spend is attributable without the log store
 * holding an account id or an email.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const dimensions = {
  feature: (run) => run.feature ?? "unknown",
  model: (run) => run.model ?? "unknown",
  user: (run) => run.userRef ?? "anonymous",
  day: (run) => (run.startedAt ?? "").slice(0, 10) || "unknown",
  month: (run) => (run.startedAt ?? "").slice(0, 7) || "unknown",
  outcome: (run) => run.outcome ?? "unknown",
};

let options;
let files;
try {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      by: { type: "string", default: "feature,model" },
      since: { type: "string" },
      until: { type: "string" },
      top: { type: "string" },
      csv: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  options = parsed.values;
  files = parsed.positionals;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (options.help) {
  console.log(`Usage: ai-runs-report [files...] [options]

  --by <dims>     Comma-separated: ${Object.keys(dimensions).join(", ")} (default: feature,model)
  --since <date>  Only runs at or after this date
  --until <date>  Only runs before this date
  --top <n>       Keep the n most expensive rows
  --csv           Emit CSV, for a spreadsheet
  --json          Emit JSON
`);
  process.exit(0);
}

const groupBy = options.by.split(",").map((name) => name.trim()).filter(Boolean);
const unknownDimension = groupBy.find((name) => !(name in dimensions));
if (unknownDimension) {
  console.error(
    `--by does not know "${unknownDimension}". Available: ${Object.keys(dimensions).join(", ")}`,
  );
  process.exit(1);
}

function boundary(flag, value) {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    console.error(`${flag} needs a parseable date, for example 2026-08-01`);
    process.exit(1);
  }
  return parsed;
}

const since = boundary("--since", options.since);
const until = boundary("--until", options.until);

const top = options.top === undefined ? null : Number(options.top);
if (top !== null && (!Number.isInteger(top) || top < 1)) {
  console.error("--top needs a positive whole number");
  process.exit(1);
}

function emptyBucket(labels) {
  return {
    labels,
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
  const startedAt = Date.parse(run.startedAt);
  if (since !== null && !(startedAt >= since)) return;
  if (until !== null && !(startedAt < until)) return;

  const labels = groupBy.map((name) => dimensions[name](run));
  const key = labels.join("\u0000");
  let bucket = byKey.get(key);
  if (!bucket) {
    bucket = emptyBucket(labels);
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
      // Accepts a raw container line, a Cloud Logging export (which nests the
      // line under jsonPayload), or a bare run record.
      const payload = parsed.jsonPayload ?? parsed;
      const run = payload.ai ?? payload;
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

let rows = [...byKey.values()]
  .map((bucket) => {
    const sorted = [...bucket.durations].sort((a, b) => a - b);
    const row = {
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
    groupBy.forEach((name, index) => {
      row[name] = bucket.labels[index];
    });
    return row;
  })
  .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.calls - a.calls);

const totalCost = rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0);
const totalUnpriced = rows.reduce((sum, row) => sum + row.unpricedCalls, 0);

// Totals are computed before --top, so a truncated view still reports honest
// overall spend rather than the spend of the rows that survived.
if (top !== null) rows = rows.slice(0, top);

const numericColumns = [
  ["calls", (row) => row.calls],
  ["fail%", (row) => `${(row.failureRate * 100).toFixed(1)}%`],
  ["p50ms", (row) => row.p50Ms],
  ["p95ms", (row) => row.p95Ms],
  ["in", (row) => row.promptTokens],
  ["cached", (row) => row.cachedPromptTokens],
  ["out", (row) => row.outputTokens],
];

if (options.json) {
  console.log(JSON.stringify(
    { groupBy, totalCostUsd: totalCost, totalCalls, unpricedCalls: totalUnpriced, rows },
    null,
    2,
  ));
  process.exit(0);
}

if (options.csv) {
  const header = [
    ...groupBy,
    "calls",
    "ok",
    "failed",
    "failureRate",
    "p50Ms",
    "p95Ms",
    "promptTokens",
    "cachedPromptTokens",
    "outputTokens",
    "costUsd",
    "costPerOkUsd",
    "unpricedCalls",
  ];
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  console.log(header.join(","));
  for (const row of rows) {
    console.log([
      ...groupBy.map((name) => row[name]),
      row.calls,
      row.ok,
      row.failed,
      row.failureRate.toFixed(4),
      row.p50Ms,
      row.p95Ms,
      row.promptTokens,
      row.cachedPromptTokens,
      row.outputTokens,
      // Blank rather than 0 for an unknown cost, so a spreadsheet sum does not
      // quietly treat unpriced calls as free.
      row.costUsd === null ? "" : row.costUsd.toFixed(6),
      row.costPerOkUsd === null ? "" : row.costPerOkUsd.toFixed(6),
      row.unpricedCalls,
    ].map(escape).join(","));
  }
  process.exit(0);
}

if (!rows.length) {
  console.log("No ai.run records found.");
  process.exit(0);
}

const usd = (value) => (value === null ? "n/a" : `$${value.toFixed(6)}`);

const columns = [
  ...groupBy.map((name) => ({
    header: name,
    align: "start",
    value: (row) => row[name],
  })),
  ...numericColumns.map(([header, value]) => ({ header, align: "end", value })),
  { header: "cost", align: "end", value: (row) => usd(row.costUsd) },
  { header: "cost/ok", align: "end", value: (row) => usd(row.costPerOkUsd) },
];

// Size each column to its widest cell so a long model id or a short day label
// both stay readable.
const widths = columns.map((column) => Math.max(
  column.header.length,
  ...rows.map((row) => String(column.value(row)).length),
));

function line(cells) {
  return cells
    .map((cell, index) => (columns[index].align === "start"
      ? String(cell).padEnd(widths[index])
      : String(cell).padStart(widths[index])))
    .join("  ")
    .trimEnd();
}

console.log(line(columns.map((column) => column.header)));
for (const row of rows) {
  console.log(line(columns.map((column) => column.value(row))));

  const reasons = Object.entries(row.reasons);
  if (reasons.length) {
    const detail = reasons.map(([reason, count]) => `${reason}=${count}`).join(", ");
    console.log(`  failures: ${detail}`);
  }
}

console.log(
  `\nTotal: $${totalCost.toFixed(4)} across ${totalCalls} calls`
  + (totalUnpriced ? ` (${totalUnpriced} unpriced, excluded from the total)` : "")
  + (top !== null && rows.length < byKey.size ? `; showing top ${rows.length} of ${byKey.size}` : ""),
);
