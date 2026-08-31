import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type {
  AIProviderKind,
  ProviderSettingsResponse,
  UpdateProviderSettingsRequest,
} from "@fitai/contracts";
import type { Db } from "mongodb";
import { getConfig, type AppConfig } from "../config.js";
import { getDatabase } from "../db.js";

type ProviderName = "ai" | "gemini" | "elevenlabs";
type EncryptedSecret = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};
type ProviderSettingsDocument = {
  userId: string;
  ai?: {
    provider: AIProviderKind;
    apiKey: EncryptedSecret;
    keyHint: string;
    model: string;
    baseUrl: string | null;
  };
  /** Legacy field retained for transparent migration of existing Gemini keys. */
  gemini?: {
    apiKey: EncryptedSecret;
    keyHint: string;
    model: string;
  };
  elevenlabs?: {
    apiKey: EncryptedSecret;
    keyHint: string;
    agentId: string | null;
    voiceId: string | null;
    model: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

function credentialsKey(config = getConfig()) {
  if (!config.USER_PROVIDER_CREDENTIALS_KEY) return null;
  const key = Buffer.from(config.USER_PROVIDER_CREDENTIALS_KEY, "base64");
  if (key.length !== 32) {
    throw Object.assign(new Error("User provider credential encryption is misconfigured."), {
      statusCode: 503,
    });
  }
  return key;
}

function additionalData(userId: string, provider: ProviderName) {
  return Buffer.from(`forgefit:provider-key:v1:${userId}:${provider}`, "utf8");
}

export function encryptProviderSecret(
  secret: string,
  userId: string,
  provider: ProviderName,
  key: Buffer,
): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(additionalData(userId, provider));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptProviderSecret(
  encrypted: EncryptedSecret,
  userId: string,
  provider: ProviderName,
  key: Buffer,
) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(additionalData(userId, provider));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function keyHint(secret: string) {
  return `••••${secret.slice(-4)}`;
}

async function loadSettings(database: Db, userId: string) {
  return database.collection<ProviderSettingsDocument>("providerSettings")
    .findOne({ userId }, { projection: { _id: 0 } });
}

function platformAISettings(config = getConfig()) {
  const apiKey = config.AI_API_KEY ?? config.GEMINI_API_KEY ?? "";
  const model = config.AI_MODEL ?? config.GEMINI_MODEL;
  const baseUrl = config.AI_BASE_URL ?? null;
  return { provider: config.AI_PROVIDER, apiKey, model, baseUrl };
}

export async function providerSettingsStatus(
  userId: string,
  database?: Db,
): Promise<ProviderSettingsResponse> {
  const resolvedDatabase = database ?? await getDatabase();
  const config = getConfig();
  const document = await loadSettings(resolvedDatabase, userId);
  const platformAI = platformAISettings(config);
  const savedAI = document?.ai;
  const legacyGemini = !savedAI ? document?.gemini : undefined;
  return {
    secureStorageAvailable: Boolean(credentialsKey(config)),
    ai: {
      configured: Boolean(savedAI || legacyGemini || platformAI.apiKey),
      source: savedAI || legacyGemini ? "user" : "platform",
      keyHint: savedAI?.keyHint ?? legacyGemini?.keyHint ?? null,
      model: savedAI?.model ?? legacyGemini?.model ?? platformAI.model,
      provider: savedAI?.provider ?? (legacyGemini ? "gemini" : platformAI.provider),
      baseUrl: savedAI?.baseUrl ?? platformAI.baseUrl,
    },
    elevenlabs: {
      configured: Boolean(document?.elevenlabs || config.ELEVENLABS_API_KEY),
      source: document?.elevenlabs ? "user" : "platform",
      keyHint: document?.elevenlabs?.keyHint ?? null,
      model: document?.elevenlabs?.model ?? config.ELEVENLABS_LLM_MODEL,
      agentId: document?.elevenlabs?.agentId ?? config.ELEVENLABS_AGENT_ID ?? null,
      voiceId: document?.elevenlabs?.voiceId ?? config.ELEVENLABS_VOICE_ID ?? null,
    },
  };
}

export async function updateProviderSettings(
  userId: string,
  input: UpdateProviderSettingsRequest,
  database?: Db,
) {
  const resolvedDatabase = database ?? await getDatabase();
  const config = getConfig();
  const key = credentialsKey(config);
  if (!key) {
    throw Object.assign(new Error("Secure API-key storage is not enabled on this deployment."), {
      statusCode: 503,
    });
  }
  const existing = await loadSettings(resolvedDatabase, userId);
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (input.ai) {
    const apiKey = input.ai.apiKey?.trim();
    const existingProvider = existing?.ai?.provider ?? (existing?.gemini ? "gemini" : null);
    if (!apiKey && !existing?.ai && !existing?.gemini) {
      throw Object.assign(new Error("Enter an API key before saving a custom AI configuration."), {
        statusCode: 400,
      });
    }
    if (!apiKey && existingProvider && input.ai.provider !== existingProvider) {
      throw Object.assign(new Error("Enter the new provider's API key when changing AI providers."), {
        statusCode: 400,
      });
    }
    const baseUrl = input.ai.baseUrl === undefined
      ? (existingProvider === input.ai.provider ? existing?.ai?.baseUrl ?? null : null)
      : input.ai.baseUrl?.trim() || null;
    if (input.ai.provider === "openai_compatible" && !baseUrl) {
      throw Object.assign(new Error("Enter a base URL for the OpenAI-compatible provider."), {
        statusCode: 400,
      });
    }
    if (apiKey) {
      updates.ai = {
        provider: input.ai.provider,
        apiKey: encryptProviderSecret(apiKey, userId, "ai", key),
        keyHint: keyHint(apiKey),
        model: input.ai.model?.trim() || existing?.ai?.model || existing?.gemini?.model || platformAISettings(config).model,
        baseUrl,
      };
    } else {
      if (existing?.ai) {
        updates["ai.provider"] = input.ai.provider;
        if (input.ai.model) updates["ai.model"] = input.ai.model.trim();
        updates["ai.baseUrl"] = baseUrl;
      } else if (existing?.gemini) {
        const legacySecret = decryptProviderSecret(existing.gemini.apiKey, userId, "gemini", key);
        updates.ai = {
          provider: input.ai.provider,
          apiKey: encryptProviderSecret(legacySecret, userId, "ai", key),
          keyHint: existing.gemini.keyHint,
          model: input.ai.model?.trim() || existing.gemini.model,
          baseUrl,
        };
      }
    }
  }
  if (input.elevenlabs) {
    const apiKey = input.elevenlabs.apiKey?.trim();
    if (!apiKey && !existing?.elevenlabs) {
      throw Object.assign(new Error("Enter an ElevenLabs API key before saving a custom configuration."), {
        statusCode: 400,
      });
    }
    const model = input.elevenlabs.model?.trim() || existing?.elevenlabs?.model || config.ELEVENLABS_LLM_MODEL;
    const agentId = input.elevenlabs.agentId?.trim() || null;
    const voiceId = input.elevenlabs.voiceId?.trim() || null;
    if (apiKey) {
      updates.elevenlabs = {
        apiKey: encryptProviderSecret(apiKey, userId, "elevenlabs", key),
        keyHint: keyHint(apiKey),
        model,
        agentId,
        voiceId,
      };
    } else if (existing?.elevenlabs) {
      updates["elevenlabs.model"] = model;
      updates["elevenlabs.agentId"] = agentId;
      updates["elevenlabs.voiceId"] = voiceId;
    }
  }
  await resolvedDatabase.collection<ProviderSettingsDocument>("providerSettings").updateOne(
    { userId },
    { $set: updates, $setOnInsert: { userId, createdAt: now } },
    { upsert: true },
  );
  return providerSettingsStatus(userId, resolvedDatabase);
}

export async function deleteProviderSetting(
  userId: string,
  provider: "ai" | "elevenlabs",
  database?: Db,
) {
  const resolvedDatabase = database ?? await getDatabase();
  const unset: Partial<Record<"ai" | "gemini" | "elevenlabs", "">> = provider === "ai"
    ? { ai: "", gemini: "" }
    : { elevenlabs: "" };
  await resolvedDatabase.collection<ProviderSettingsDocument>("providerSettings")
    .updateOne({ userId }, { $unset: unset, $set: { updatedAt: new Date() } });
  return providerSettingsStatus(userId, resolvedDatabase);
}

export async function resolveAISettings(userId: string, database?: Db) {
  const config = getConfig();
  const platform = platformAISettings(config);
  const key = credentialsKey(config);
  if (!key) {
    if (!platform.apiKey) {
      throw Object.assign(new Error("No AI provider API key is configured."), { statusCode: 503 });
    }
    return { kind: platform.provider, apiKey: platform.apiKey, model: platform.model, baseUrl: platform.baseUrl, source: "platform" as const };
  }
  const document = await loadSettings(database ?? await getDatabase(), userId);
  if (document?.ai) {
    return {
      kind: document.ai.provider,
      apiKey: decryptProviderSecret(document.ai.apiKey, userId, "ai", key),
      model: document.ai.model,
      baseUrl: document.ai.baseUrl,
      source: "user" as const,
    };
  }
  if (document?.gemini) return {
    kind: "gemini" as const,
    apiKey: decryptProviderSecret(document.gemini.apiKey, userId, "gemini", key),
    model: document.gemini.model,
    baseUrl: null,
    source: "user" as const,
  };
  if (!platform.apiKey) {
    throw Object.assign(new Error("No AI provider API key is configured."), { statusCode: 503 });
  }
  return { kind: platform.provider, apiKey: platform.apiKey, model: platform.model, baseUrl: platform.baseUrl, source: "platform" as const };
}

export async function resolveGeminiSettings(userId: string, database?: Db) {
  const settings = await resolveAISettings(userId, database);
  if (settings.kind !== "gemini") {
    const config = getConfig();
    if (!config.GEMINI_API_KEY) {
      throw Object.assign(new Error("Gemini Live fallback is not configured."), { statusCode: 503 });
    }
    return { apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL, source: "platform" as const };
  }
  return settings;
}

export async function resolveElevenLabsSettings(userId: string, database?: Db) {
  const config = getConfig();
  const key = credentialsKey(config);
  const document = key ? await loadSettings(database ?? await getDatabase(), userId) : null;
  if (!key || !document?.elevenlabs) return config;
  return {
    ...config,
    ELEVENLABS_API_KEY: decryptProviderSecret(
      document.elevenlabs.apiKey,
      userId,
      "elevenlabs",
      key,
    ),
    ELEVENLABS_AGENT_ID: document.elevenlabs.agentId ?? undefined,
    ELEVENLABS_VOICE_ID: document.elevenlabs.voiceId ?? undefined,
    ELEVENLABS_LLM_MODEL: document.elevenlabs.model,
  } satisfies AppConfig;
}
