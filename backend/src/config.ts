import { z } from "zod";

const optionalSetting = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const configSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  API_JWT_SECRET: z.string().min(32),
  AI_PROVIDER: z.enum(["gemini", "openai", "anthropic", "openai_compatible"]).default("gemini"),
  AI_API_KEY: optionalSetting,
  AI_MODEL: optionalSetting,
  AI_BASE_URL: optionalSetting.pipe(z.url().optional()),
  GEMINI_API_KEY: optionalSetting,
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.1-flash-live-preview"),
  GEMINI_LIVE_VOICE: z.string().min(1).default("Charon"),
  VERTEX_AI_PROJECT: optionalSetting,
  VERTEX_AI_LOCATION: z.string().min(1).default("global"),
  VERTEX_AI_RESEARCH_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  RESEARCH_DAILY_LIMIT: z.coerce.number().int().min(1).max(1_000).default(20),
  OPS_MONTHLY_TOKEN_LIMIT: z.coerce.number().int().min(1_000).default(2_000_000),
  OPS_MONTHLY_CREDIT_LIMIT: z.coerce.number().int().min(1).default(2_000),
  OPS_TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ELEVENLABS_API_KEY: optionalSetting,
  ELEVENLABS_AGENT_ID: optionalSetting,
  ELEVENLABS_VOICE_ID: optionalSetting,
  ELEVENLABS_LLM_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  SIMLI_API_KEY: optionalSetting,
  SIMLI_FACE_ID: optionalSetting,
  USER_PROVIDER_CREDENTIALS_KEY: optionalSetting,
  EXERCISE_ASSET_BASE_URL: optionalSetting.pipe(z.url().optional()),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RELEASE_VERSION: z.string().min(1).default("0.1.0"),
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Backend configuration is invalid or missing: ${missing}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function resetConfigForTests() {
  cachedConfig = undefined;
}
