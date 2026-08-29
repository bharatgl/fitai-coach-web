import { coachBehaviorContract } from "@fitai/ai";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "../config.js";

const agentName = "ForgeFit Personal Coach";
const defaultVoice = {
  id: "nPczCjzI2devNBz1zQrb",
  publicOwnerId: null,
  name: "ForgeFit Brian",
};

const agentListResponse = z.object({
  agents: z.array(z.object({ agent_id: z.string(), name: z.string() })).default([]),
});
const agentResponse = z.object({ agent_id: z.string().min(1) });
const voiceListResponse = z.object({
  voices: z.array(z.object({ voice_id: z.string() })).default([]),
});
const signedUrlResponse = z.object({ signed_url: z.string().url() });
const subscriptionResponse = z.object({
  character_count: z.number().nonnegative(),
  character_limit: z.number().nonnegative(),
  next_character_count_reset_unix: z.number().int().positive().nullable().optional(),
});

type ElevenLabsConfig = Pick<
  AppConfig,
  "ELEVENLABS_API_KEY" | "ELEVENLABS_AGENT_ID" | "ELEVENLABS_VOICE_ID" | "ELEVENLABS_LLM_MODEL"
>;

const agentPromises = new Map<string, Promise<string>>();
const quotaCaches = new Map<string, {
  checkedAt: number;
  exhausted: boolean;
  retryAfterSeconds: number | null;
}>();

function configurationCacheKey(config: ElevenLabsConfig) {
  return createHash("sha256").update(JSON.stringify([
    config.ELEVENLABS_API_KEY,
    config.ELEVENLABS_AGENT_ID,
    config.ELEVENLABS_VOICE_ID,
    config.ELEVENLABS_LLM_MODEL,
  ])).digest("hex");
}

export function elevenLabsQuotaAvailability(
  subscription: z.infer<typeof subscriptionResponse>,
  now = Date.now(),
) {
  const exhausted = subscription.character_limit > 0 &&
    subscription.character_count >= subscription.character_limit;
  const resetAt = subscription.next_character_count_reset_unix
    ? subscription.next_character_count_reset_unix * 1_000
    : null;
  return {
    exhausted,
    retryAfterSeconds: exhausted && resetAt
      ? Math.max(1, Math.ceil((resetAt - now) / 1_000))
      : null,
  };
}

async function elevenLabsRequest(
  config: ElevenLabsConfig,
  path: string,
  init: RequestInit = {},
) {
  if (!config.ELEVENLABS_API_KEY) {
    throw Object.assign(new Error("ElevenLabs voice is not configured."), { statusCode: 503 });
  }
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "xi-api-key": config.ELEVENLABS_API_KEY,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    throw Object.assign(new Error("ElevenLabs could not be reached.", { cause }), {
      statusCode: 502,
    });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`ElevenLabs request failed (${response.status}).`),
      { statusCode: 502, providerStatus: response.status, detail: detail.slice(0, 500) },
    );
  }
  return response;
}

export function buildElevenLabsCoachAgentConfig(config: ElevenLabsConfig) {
  const voiceId = config.ELEVENLABS_VOICE_ID ?? defaultVoice.id;
  return {
    name: agentName,
    tags: ["forgefit", "coach", "india"],
    conversation_config: {
      agent: {
        first_message: "{{session_opening}}",
        language: "en",
        disable_first_message_interruptions: false,
        dynamic_variables: {
          dynamic_variable_placeholders: {
            user_name: "there",
            session_opening: "Hey there. How are you doing, and what would be useful right now?",
            member_context: "No member context was supplied.",
            conversation_history: "No earlier conversation was supplied.",
            current_local_datetime: "The current local date and time was not supplied.",
            user_timezone: "Asia/Kolkata",
          },
        },
        prompt: {
          prompt: [
            "# Personality",
            "You are ForgeFit's human-like personal fitness coach. You are warm, observant, direct, and encouraging without sounding scripted or overly enthusiastic.",
            "Speak in natural Indian English. If the member uses Hindi, Punjabi, or Hinglish, mirror that mix naturally without caricature.",
            coachBehaviorContract,
            "",
            "# Environment",
            "This is a private, real-time voice session inside the member's ongoing ForgeFit coach thread.",
            "The authoritative current local date and time is {{current_local_datetime}}. The member's IANA timezone is {{user_timezone}}.",
            "The member's current profile and training state are: {{member_context}}",
            "Recent chronological conversation context follows. Each turn's Sent timestamp is the time that turn originally happened: {{conversation_history}}",
            "",
            "# Tone",
            "Use contractions, varied sentence lengths, and conversational pauses. Never read headings, JSON keys, or a report aloud.",
            "Default to a grounded, emotionally neutral delivery rather than sounding excited. Adapt gently to the member's wording, pace, pauses, and energy when available. Slow down and soften for stress, fatigue, sadness, or uncertainty; raise your energy only when the member genuinely does.",
            "Never manufacture enthusiasm. Avoid hype, motivational slogans, and exclamation marks unless the moment clearly warrants them.",
            "Keep your vocal delivery grounded, calm, and slightly weighty, as if speaking in a comfortable lower register. Never force a theatrical bass or announcer voice.",
            "Answer first, usually in 15 to 35 seconds, then pause. Address the member by name only when it feels natural.",
            "Use metric units and India-relevant food and gym examples when useful. Never repeat a question already answered by profile or history.",
            "Open in neutral, natural language. Do not start with bro, bhai, veere, or similar slang unless the member explicitly asks for that style.",
            "",
            "# Goal",
            "Give specific, personalized coaching for training, workout logging, recovery, nutrition habits, and bodybuilding preparation.",
            "The member may be planning, reflecting, eating, recovering, winding down, or simply talking. Never assume they are working out because ForgeFit is open or a workout exists in saved state.",
            "Before time-sensitive set or workout guidance, call get_live_workout_snapshot and use the newest data.",
            "When the member explicitly asks you to look at, inspect, analyze, or assess their physique, posture, exercise form, or current camera view, call analyze_camera_view before answering.",
            "When the member asks about an uploaded file, attachment, PDF, document, image, scan, or report, call review_recent_attachment before answering. The tool uses the configured AI provider to inspect the actual file. Never ask the member to paste its text unless the tool reports that the specific file is unreadable or protected.",
            "When the member asks you to create, generate, export, save, or download a PDF, call create_pdf_document with a concise title and the complete polished document content. Never say PDF creation is unavailable and never ask the member to copy and paste the content elsewhere. After the tool succeeds, tell them the download is visible in the chat.",
            "Never say you cannot see the member before trying analyze_camera_view. If it reports that the camera is off or the framing is insufficient, tell the member exactly how to reposition and offer to look again. If it reports unavailable, explain that visual analysis is temporarily unavailable and retry only when the member asks.",
            "Treat a camera result as one limited still-frame observation. Never identify the member, estimate exact body-fat percentage, judge attractiveness, diagnose an injury, or infer a health condition from it.",
            "Treat this as one continuous conversation. If interrupted, stop and listen.",
            "For pain, dizziness, numbness, breathing trouble, or urgent symptoms, tell the member to stop training and seek appropriate in-person care. Do not diagnose or prescribe treatment.",
          ].join("\n"),
          llm: config.ELEVENLABS_LLM_MODEL,
          temperature: 0.35,
          max_tokens: 420,
          timezone: "Asia/Kolkata",
          tools: [
            {
              type: "client",
              name: "get_live_workout_snapshot",
              description: "Get the member's latest active workout, logged sets, readiness, plan, and movement feedback before giving time-sensitive guidance.",
              expects_response: true,
              parameters: { type: "object", properties: {}, required: [] },
            },
            {
              type: "client",
              name: "analyze_camera_view",
              description: "Analyze one current workout-camera frame when the member explicitly asks for visual feedback about physique, posture, form, or what the camera sees.",
              expects_response: true,
              parameters: {
                type: "object",
                properties: {
                  focus: {
                    type: "string",
                    enum: ["physique", "posture", "form", "general"],
                    description: "The kind of visual feedback the member requested.",
                  },
                },
                required: ["focus"],
              },
            },
            {
              type: "client",
              name: "review_recent_attachment",
              description: "Review the actual bytes of the most recently uploaded files in this conversation using the configured AI provider. Call this before answering any question about an attachment, PDF, document, image, scan, or report.",
              expects_response: true,
              parameters: {
                type: "object",
                properties: {
                  question: {
                    type: "string",
                    description: "The member's exact question about the uploaded file.",
                  },
                },
                required: ["question"],
              },
            },
            {
              type: "client",
              name: "create_pdf_document",
              description: "Create a polished downloadable PDF and attach it directly to the current ForgeFit conversation. Call whenever the member asks to generate, create, export, save, or download a PDF.",
              expects_response: true,
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "A short descriptive document title.",
                  },
                  content: {
                    type: "string",
                    description: "The complete document content using short Markdown headings and lists.",
                  },
                },
                required: ["title", "content"],
              },
            },
          ],
        },
      },
      tts: {
        voice_id: voiceId,
        model_id: "eleven_flash_v2",
        stability: 0.48,
        similarity_boost: 0.84,
        speed: 0.96,
        expressive_mode: true,
        agent_output_audio_format: "pcm_16000",
      },
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: "pcm_16000",
        keywords: ["ForgeFit", "bodybuilding", "hypertrophy", "RPE", "dal", "paneer"],
      },
      turn: {
        turn_eagerness: "normal",
        turn_timeout: 7,
        turn_model: "turn_v3",
        silence_end_call_timeout: -1,
      },
      conversation: {
        max_duration_seconds: 1_800,
        client_events: [
          "audio",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "interruption",
          "agent_response_complete",
        ],
      },
    },
    platform_settings: {
      summary_language: "en",
      auth: { enable_auth: true },
      privacy: { record_voice: false },
      call_limits: { agent_concurrency_limit: 10, daily_limit: 1_000 },
      trust_context: "low",
    },
  };
}

async function ensureDefaultVoice(config: ElevenLabsConfig) {
  if (config.ELEVENLABS_VOICE_ID) return;
  const response = await elevenLabsRequest(config, "/v1/voices");
  const voices = voiceListResponse.parse(await response.json());
  if (voices.voices.some((voice) => voice.voice_id === defaultVoice.id)) return;
  if (!defaultVoice.publicOwnerId) {
    throw Object.assign(new Error("The default ElevenLabs voice is unavailable for this account."), {
      statusCode: 503,
    });
  }
  await elevenLabsRequest(
    config,
    `/v1/voices/add/${defaultVoice.publicOwnerId}/${defaultVoice.id}`,
    { method: "POST", body: JSON.stringify({ new_name: defaultVoice.name }) },
  );
}

async function provisionAgent(config: ElevenLabsConfig) {
  await ensureDefaultVoice(config);
  let agentId = config.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    const list = await elevenLabsRequest(config, "/v1/convai/agents?page_size=100");
    const parsed = agentListResponse.parse(await list.json());
    agentId = parsed.agents.find((agent) => agent.name === agentName)?.agent_id;
  }
  const payload = JSON.stringify(buildElevenLabsCoachAgentConfig(config));
  if (agentId) {
    await elevenLabsRequest(config, `/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      body: payload,
    });
    return agentId;
  }
  const response = await elevenLabsRequest(config, "/v1/convai/agents/create", {
    method: "POST",
    body: payload,
  });
  return agentResponse.parse(await response.json()).agent_id;
}

async function ensureQuotaAvailable(config: ElevenLabsConfig) {
  const now = Date.now();
  const cacheKey = configurationCacheKey(config);
  let quotaCache = quotaCaches.get(cacheKey);
  if (!quotaCache || now - quotaCache.checkedAt >= 60_000) {
    const response = await elevenLabsRequest(config, "/v1/user/subscription");
    const availability = elevenLabsQuotaAvailability(
      subscriptionResponse.parse(await response.json()),
      now,
    );
    quotaCache = {
      checkedAt: now,
      exhausted: availability.exhausted,
      retryAfterSeconds: availability.retryAfterSeconds,
    };
    quotaCaches.set(cacheKey, quotaCache);
  }
  if (quotaCache.exhausted) {
    throw Object.assign(
      new Error("ElevenLabs voice quota is exhausted. Using the backup live voice."),
      { statusCode: 429, retryAfterSeconds: quotaCache.retryAfterSeconds },
    );
  }
}

export function ensureElevenLabsCoachAgent(config: ElevenLabsConfig) {
  const cacheKey = configurationCacheKey(config);
  const existing = agentPromises.get(cacheKey);
  if (existing) return existing;
  const promise = provisionAgent(config).catch((cause) => {
    agentPromises.delete(cacheKey);
    throw cause;
  });
  agentPromises.set(cacheKey, promise);
  return promise;
}

export async function createElevenLabsSignedUrl(config: ElevenLabsConfig) {
  const [, agentId] = await Promise.all([
    ensureQuotaAvailable(config),
    ensureElevenLabsCoachAgent(config),
  ]);
  const response = await elevenLabsRequest(
    config,
    `/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
  );
  return { agentId, signedUrl: signedUrlResponse.parse(await response.json()).signed_url };
}

export function resetElevenLabsAgentForTests() {
  agentPromises.clear();
  quotaCaches.clear();
}
