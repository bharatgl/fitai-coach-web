import { z } from "zod";

const optionalSetting = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const configSchema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  API_JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.1-flash-live-preview"),
  GEMINI_LIVE_VOICE: z.string().min(1).default("Charon"),
  SIMLI_API_KEY: optionalSetting,
  SIMLI_FACE_ID: optionalSetting,
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
