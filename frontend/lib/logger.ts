/**
 * Server-side structured logging for the Next.js container.
 *
 * Emits the same line shape as the backend's pino configuration so both
 * containers ingest identically:
 *
 *   { "severity": "INFO", "level": "info", "time": "...", "message": "...", ... }
 *
 * `severity`, `time`, and `message` are the fields Cloud Logging promotes out of
 * the JSON payload; every other key stays a structured `jsonPayload` field.
 * Deliberately dependency-free — the frontend has no logging library and does
 * not need one for a handful of lines.
 */
export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

export type LogLevel = (typeof logLevels)[number];

const severityByLevel: Record<LogLevel, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

/** Quietest first, so a level is emitted when its rank is at or below the floor. */
const rankByLevel: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL;
  return (logLevels as readonly string[]).includes(value ?? "")
    ? (value as LogLevel)
    : "info";
}

export function shouldLog(level: LogLevel, floor: LogLevel = configuredLevel()): boolean {
  return rankByLevel[level] <= rankByLevel[floor];
}

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({
    severity: severityByLevel[level],
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  });
  // Anything at warn or above goes to stderr so it is separable at the stream
  // level too, not only by parsing severity.
  if (rankByLevel[level] <= rankByLevel.warn) console.error(line);
  else console.log(line);
}

export const logger = {
  fatal: (message: string, fields?: Record<string, unknown>) => write("fatal", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  trace: (message: string, fields?: Record<string, unknown>) => write("trace", message, fields),
};
