import type {
  OperationsAlert,
  OperationsDashboardResponse,
  OperationsLogEntry,
  OperationsModelUsage,
  OperationsPerformanceRow,
  OperationsSeriesPoint,
  OperationsTimeRange,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { getHeapStatistics } from "node:v8";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase } from "../db.js";
import { providerSettingsStatus } from "../services/provider-settings.js";
import type { SystemRequestLogDocument } from "../services/request-telemetry.js";
import { syncAuthenticatedUser } from "../users.js";

const operationsQuery = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("7d"),
});

type UsageMessage = {
  role: "user" | "assistant";
  content?: string;
  model?: string | null;
  createdAt: Date;
};

type Bucket = OperationsSeriesPoint & { startsAt: number; endsAt: number };

const rangeSettings: Record<OperationsTimeRange, {
  durationMs: number;
  buckets: number;
  label: string;
}> = {
  "24h": { durationMs: 24 * 60 * 60 * 1_000, buckets: 12, label: "Last 24 hours" },
  "7d": { durationMs: 7 * 24 * 60 * 60 * 1_000, buckets: 7, label: "Last 7 days" },
  "30d": { durationMs: 30 * 24 * 60 * 60 * 1_000, buckets: 15, label: "Last 30 days" },
};

function estimateTokens(content: string | undefined) {
  if (!content) return 0;
  return Math.max(1, Math.ceil(content.trim().length / 4));
}

function rounded(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

function providerFromModel(model: string) {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("vertex:")) return "Vertex AI";
  if (normalized.includes("gemini")) return "Google Gemini";
  if (normalized.includes("gpt") || normalized.includes("openai")) return "OpenAI";
  if (normalized.includes("claude") || normalized.includes("anthropic")) return "Anthropic";
  if (normalized.includes("eleven")) return "ElevenLabs";
  if (normalized.includes("pdf-renderer")) return "ForgeFit";
  return "Configured AI";
}

function formatBucketLabel(timestamp: Date, range: OperationsTimeRange) {
  return range === "24h"
    ? timestamp.toLocaleTimeString("en", { hour: "numeric", hour12: true, timeZone: "UTC" })
    : timestamp.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function makeBuckets(now: Date, range: OperationsTimeRange): Bucket[] {
  const setting = rangeSettings[range];
  const bucketMs = setting.durationMs / setting.buckets;
  const start = now.getTime() - setting.durationMs;
  return Array.from({ length: setting.buckets }, (_, index) => {
    const startsAt = start + index * bucketMs;
    return {
      startsAt,
      endsAt: startsAt + bucketMs,
      timestamp: new Date(startsAt).toISOString(),
      label: formatBucketLabel(new Date(startsAt), range),
      requests: 0,
      tokens: 0,
      errors: 0,
    };
  });
}

function bucketFor(buckets: Bucket[], date: Date) {
  const time = date.getTime();
  return buckets.find((bucket, index) =>
    time >= bucket.startsAt && (time < bucket.endsAt || (index === buckets.length - 1 && time <= bucket.endsAt))
  );
}

function performanceRows(logs: SystemRequestLogDocument[]): OperationsPerformanceRow[] {
  const grouped = new Map<string, SystemRequestLogDocument[]>();
  for (const log of logs) grouped.set(log.route, [...(grouped.get(log.route) ?? []), log]);
  return [...grouped.entries()].map(([route, entries]) => {
    const latencies = entries.map((entry) => entry.durationMs);
    const failed = entries.filter((entry) => entry.statusCode >= 400).length;
    return {
      route,
      requests: entries.length,
      errorRate: rounded((failed / entries.length) * 100),
      averageLatencyMs: rounded(latencies.reduce((sum, value) => sum + value, 0) / entries.length),
      p95LatencyMs: rounded(percentile(latencies, 0.95)),
    };
  }).sort((left, right) => right.requests - left.requests || right.p95LatencyMs - left.p95LatencyMs)
    .slice(0, 8);
}

function logEntry(log: SystemRequestLogDocument): OperationsLogEntry {
  const level = log.statusCode >= 500 ? "error" : log.statusCode >= 400 ? "warning" : "info";
  return {
    id: log.id,
    timestamp: log.timestamp.toISOString(),
    level,
    method: log.method,
    route: log.route,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    message: `${log.method} ${log.route} completed with ${log.statusCode}`,
  };
}

function monthlyStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function alert(
  id: string,
  severity: OperationsAlert["severity"],
  title: string,
  message: string,
  value: string,
): OperationsAlert {
  return { id, severity, title, message, value };
}

export async function operationsRoutes(app: FastifyInstance) {
  app.get("/v1/operations/dashboard", async (request): Promise<OperationsDashboardResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const { range } = operationsQuery.parse(request.query ?? {});
    const config = getConfig();
    const database = await getDatabase();
    const now = new Date();
    const setting = rangeSettings[range];
    const rangeStart = new Date(now.getTime() - setting.durationMs);
    const previousStart = new Date(rangeStart.getTime() - setting.durationMs);
    const monthStart = monthlyStart(now);
    const earliestMessage = new Date(Math.min(previousStart.getTime(), monthStart.getTime()));

    const databasePingStarted = performance.now();
    await database.command({ ping: 1 });
    const databaseLatencyMs = rounded(performance.now() - databasePingStarted);

    const [requestLogs, coachMessages, botMessages, providers, researchUsage] = await Promise.all([
      database.collection<SystemRequestLogDocument>("systemRequestLogs")
        .find({ userId: user.id, timestamp: { $gte: rangeStart } }, { projection: { _id: 0, expiresAt: 0 } })
        .sort({ timestamp: -1 })
        .limit(5_000)
        .toArray(),
      database.collection<UsageMessage>("coachMessages")
        .find(
          { userId: user.id, createdAt: { $gte: earliestMessage } },
          { projection: { _id: 0, role: 1, content: 1, model: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(10_000)
        .toArray(),
      database.collection<UsageMessage>("botMessages")
        .find(
          { userId: user.id, createdAt: { $gte: earliestMessage } },
          { projection: { _id: 0, role: 1, content: 1, model: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(10_000)
        .toArray(),
      providerSettingsStatus(user.id, database),
      database.collection<{ _id: string; count: number }>("researchUsage")
        .findOne({ _id: `global:${now.toISOString().slice(0, 10)}` }, { projection: { count: 1 } }),
    ]);

    const messages = [...coachMessages, ...botMessages];
    const selectedMessages = messages.filter((message) => message.createdAt >= rangeStart);
    const previousMessages = messages.filter((message) =>
      message.createdAt >= previousStart && message.createdAt < rangeStart
    );
    const monthlyMessages = messages.filter((message) => message.createdAt >= monthStart);
    const tokensFor = (items: UsageMessage[]) =>
      items.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    const inputTokens = tokensFor(selectedMessages.filter((message) => message.role === "user"));
    const outputTokens = tokensFor(selectedMessages.filter((message) => message.role === "assistant"));
    const totalTokens = inputTokens + outputTokens;
    const previousPeriodTokens = tokensFor(previousMessages);
    const monthlyTokens = tokensFor(monthlyMessages);
    const tokenChangePercent = previousPeriodTokens > 0
      ? rounded(((totalTokens - previousPeriodTokens) / previousPeriodTokens) * 100)
      : null;

    const modelsByName = new Map<string, OperationsModelUsage>();
    for (const message of selectedMessages) {
      if (message.role !== "assistant") continue;
      const model = message.model?.trim() || "Safety / local response";
      const item = modelsByName.get(model) ?? {
        model,
        provider: providerFromModel(model),
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      const output = estimateTokens(message.content);
      item.requests += 1;
      item.outputTokens += output;
      item.totalTokens += output;
      modelsByName.set(model, item);
    }
    const models = [...modelsByName.values()]
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .slice(0, 8);

    const failedRequests = requestLogs.filter((entry) => entry.statusCode >= 400).length;
    const successfulRequests = requestLogs.length - failedRequests;
    const latencies = requestLogs.map((entry) => entry.durationMs);
    const errorRate = requestLogs.length ? rounded((failedRequests / requestLogs.length) * 100) : 0;
    const averageLatencyMs = latencies.length
      ? rounded(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : 0;
    const p50LatencyMs = rounded(percentile(latencies, 0.5));
    const p95LatencyMs = rounded(percentile(latencies, 0.95));
    const memory = process.memoryUsage();
    const heapLimit = getHeapStatistics().heap_size_limit;

    const buckets = makeBuckets(now, range);
    for (const entry of requestLogs) {
      const bucket = bucketFor(buckets, entry.timestamp);
      if (!bucket) continue;
      bucket.requests += 1;
      if (entry.statusCode >= 400) bucket.errors += 1;
    }
    for (const message of selectedMessages) {
      const bucket = bucketFor(buckets, message.createdAt);
      if (bucket) bucket.tokens += estimateTokens(message.content);
    }

    const tokenBudgetPercent = (monthlyTokens / config.OPS_MONTHLY_TOKEN_LIMIT) * 100;
    const monthlyCredits = rounded(monthlyTokens / 1_000, 2);
    const creditBudgetPercent = (monthlyCredits / config.OPS_MONTHLY_CREDIT_LIMIT) * 100;
    const alerts: OperationsAlert[] = [];
    if (!providers.ai.configured) {
      alerts.push(alert("ai-unconfigured", "critical", "AI provider is not configured", "Text generation and analysis requests cannot run until credentials are added.", "Action needed"));
    }
    if (tokenBudgetPercent >= 80) {
      alerts.push(alert("token-budget", tokenBudgetPercent >= 95 ? "critical" : "warning", "Monthly token budget is running high", `${rounded(tokenBudgetPercent)}% of the configured monthly estimate has been used.`, `${monthlyTokens.toLocaleString()} tokens`));
    }
    if (creditBudgetPercent >= 80) {
      alerts.push(alert("credit-budget", creditBudgetPercent >= 95 ? "critical" : "warning", "Credit allowance is running high", "Normalized credit use is approaching the configured monthly allowance.", `${monthlyCredits} credits`));
    }
    if (errorRate >= 5) {
      alerts.push(alert("error-rate", errorRate >= 15 ? "critical" : "warning", "Request error rate is elevated", "Review the latest failed requests and provider availability.", `${errorRate}% errors`));
    }
    if (p95LatencyMs >= 2_000) {
      alerts.push(alert("latency", p95LatencyMs >= 5_000 ? "critical" : "warning", "P95 latency is elevated", "At least 5% of measured requests are taking longer than expected.", `${p95LatencyMs} ms`));
    }
    if ((researchUsage?.count ?? 0) >= config.RESEARCH_DAILY_LIMIT * 0.8) {
      alerts.push(alert("research-budget", "warning", "Research quota is nearly used", "Live grounded research resets at 00:00 UTC.", `${researchUsage?.count ?? 0}/${config.RESEARCH_DAILY_LIMIT}`));
    }
    if (!alerts.length) {
      alerts.push(alert("nominal", "info", "All monitored thresholds are normal", "No budget, latency, provider, or error-rate alert needs attention.", "Healthy"));
    }

    const apiStatus = errorRate >= 15 ? "degraded" : "operational";
    const databaseStatus = databaseLatencyMs >= 500 ? "degraded" : "operational";
    const aiStatus = providers.ai.configured ? "operational" : "unconfigured";
    const voiceStatus = providers.elevenlabs.configured ? "operational" : "unconfigured";
    const runtimeStatus = [apiStatus, databaseStatus].includes("degraded") || aiStatus === "unconfigured"
      ? "degraded"
      : "healthy";

    return {
      generatedAt: now.toISOString(),
      range,
      rangeLabel: setting.label,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        previousPeriodTokens,
        tokenChangePercent,
        estimatedCredits: rounded(totalTokens / 1_000, 2),
        monthlyTokens,
        monthlyTokenLimit: config.OPS_MONTHLY_TOKEN_LIMIT,
        monthlyCredits,
        monthlyCreditLimit: config.OPS_MONTHLY_CREDIT_LIMIT,
        conversations: selectedMessages.filter((message) => message.role === "assistant").length,
        liveSessions: requestLogs.filter((entry) => /live-token|voice-session|elevenlabs-session/.test(entry.route)).length,
        researchRequestsToday: researchUsage?.count ?? 0,
        researchDailyLimit: config.RESEARCH_DAILY_LIMIT,
        models,
      },
      traffic: {
        requests: requestLogs.length,
        successfulRequests,
        failedRequests,
        errorRate,
        averageLatencyMs,
        p50LatencyMs,
        p95LatencyMs,
        requestBytes: requestLogs.reduce((sum, entry) => sum + entry.requestBytes, 0),
        responseBytes: requestLogs.reduce((sum, entry) => sum + entry.responseBytes, 0),
      },
      runtime: {
        status: runtimeStatus,
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        environment: config.NODE_ENV,
        release: config.RELEASE_VERSION,
        memoryUsedMb: rounded(memory.heapUsed / 1024 / 1024),
        memoryLimitMb: rounded(heapLimit / 1024 / 1024),
      },
      alerts,
      services: [
        { id: "api", name: "Backend API", status: apiStatus, detail: `${errorRate}% error rate across ${requestLogs.length} measured requests`, latencyMs: p50LatencyMs },
        { id: "database", name: "MongoDB", status: databaseStatus, detail: databaseStatus === "operational" ? "Connected and accepting queries" : "Ping latency is above 500 ms", latencyMs: databaseLatencyMs },
        { id: "ai", name: `${providers.ai.provider} · ${providers.ai.model}`, status: aiStatus, detail: providers.ai.configured ? `${providers.ai.source} credentials configured` : "Add AI provider credentials", latencyMs: null },
        { id: "voice", name: "ElevenLabs voice", status: voiceStatus, detail: providers.elevenlabs.configured ? `${providers.elevenlabs.source} credentials configured` : "Optional voice provider is not configured", latencyMs: null },
      ],
      series: buckets.map((bucket) => ({
        timestamp: bucket.timestamp,
        label: bucket.label,
        requests: bucket.requests,
        tokens: bucket.tokens,
        errors: bucket.errors,
      })),
      performance: performanceRows(requestLogs),
      logs: requestLogs.slice(0, 100).map(logEntry),
      updates: [
        { id: "release", title: `Release ${config.RELEASE_VERSION}`, detail: `${config.NODE_ENV} runtime on ${process.version}`, status: "active" },
        { id: "telemetry", title: "Operations telemetry", detail: `Request metrics and backend logs retained for ${config.OPS_TELEMETRY_RETENTION_DAYS} days`, status: "configured" },
        { id: "provider", title: "Primary AI model", detail: `${providers.ai.provider} · ${providers.ai.model}`, status: providers.ai.configured ? "configured" : "attention" },
        { id: "research", title: "Grounded research allowance", detail: `${researchUsage?.count ?? 0} of ${config.RESEARCH_DAILY_LIMIT} requests used today`, status: (researchUsage?.count ?? 0) < config.RESEARCH_DAILY_LIMIT ? "active" : "attention" },
      ],
      notes: {
        tokenEstimate: "Token totals are estimates derived from stored user and assistant text (approximately four characters per token). Provider-side system prompts, images, audio, and cached tokens are not included.",
        creditDefinition: "One normalized AI credit equals 1,000 estimated text tokens. This is a planning unit, not a provider invoice or currency amount.",
        retention: `Request metadata is user-scoped, excludes prompt contents, and expires automatically after ${config.OPS_TELEMETRY_RETENTION_DAYS} days.`,
      },
    };
  });
}
