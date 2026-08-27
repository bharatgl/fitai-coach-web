import { z } from "zod";
import type { AppConfig } from "../config.js";

const agentName = "ForgeFit Personal Coach";
const defaultVoice = {
  id: "SQ8WYwlpzxrTbbuJgi38",
  publicOwnerId: "160aac6f63afb66ad5e88dd7e3271dd69a16a6dbc3dfb2db4d09e55c1b308d65",
  name: "ForgeFit Neel",
};

const agentListResponse = z.object({
  agents: z.array(z.object({ agent_id: z.string(), name: z.string() })).default([]),
});
const agentResponse = z.object({ agent_id: z.string().min(1) });
const voiceListResponse = z.object({
  voices: z.array(z.object({ voice_id: z.string() })).default([]),
});
const signedUrlResponse = z.object({ signed_url: z.string().url() });

type ElevenLabsConfig = Pick<
  AppConfig,
  "ELEVENLABS_API_KEY" | "ELEVENLABS_AGENT_ID" | "ELEVENLABS_VOICE_ID" | "ELEVENLABS_LLM_MODEL"
>;

let agentPromise: Promise<string> | undefined;

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
        first_message: "Hi {{user_name}}, good to have you back. What are we working on today?",
        language: "en",
        disable_first_message_interruptions: false,
        dynamic_variables: {
          dynamic_variable_placeholders: {
            user_name: "there",
            member_context: "No member context was supplied.",
            conversation_history: "No earlier conversation was supplied.",
          },
        },
        prompt: {
          prompt: [
            "# Personality",
            "You are ForgeFit's human-like personal fitness coach. You are warm, observant, direct, and encouraging without sounding scripted or overly enthusiastic.",
            "Speak in natural Indian English. If the member uses Hindi, Punjabi, or Hinglish, mirror that mix naturally without caricature.",
            "",
            "# Environment",
            "This is a private, real-time voice session inside the member's ongoing ForgeFit coach thread.",
            "The member's current profile and training state are: {{member_context}}",
            "Recent chronological conversation context is: {{conversation_history}}",
            "",
            "# Tone",
            "Use contractions, varied sentence lengths, and conversational pauses. Never read headings, JSON keys, or a report aloud.",
            "Answer first, usually in 15 to 35 seconds, then pause. Address the member by name only when it feels natural.",
            "Use metric units and India-relevant food and gym examples when useful. Never repeat a question already answered by profile or history.",
            "",
            "# Goal",
            "Give specific, personalized coaching for training, workout logging, recovery, nutrition habits, and bodybuilding preparation.",
            "Before time-sensitive set or workout guidance, call get_live_workout_snapshot and use the newest data.",
            "Treat this as one continuous conversation. If interrupted, stop and listen.",
            "For pain, dizziness, numbness, breathing trouble, or urgent symptoms, tell the member to stop training and seek appropriate in-person care. Do not diagnose or prescribe treatment.",
          ].join("\n"),
          llm: config.ELEVENLABS_LLM_MODEL,
          temperature: 0.55,
          max_tokens: 420,
          timezone: "Asia/Kolkata",
          tools: [{
            type: "client",
            name: "get_live_workout_snapshot",
            description: "Get the member's latest active workout, logged sets, readiness, plan, and movement feedback before giving time-sensitive guidance.",
            expects_response: true,
            parameters: { type: "object", properties: {}, required: [] },
          }],
        },
      },
      tts: {
        voice_id: voiceId,
        model_id: "eleven_flash_v2",
        stability: 0.42,
        similarity_boost: 0.82,
        speed: 0.98,
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

export function ensureElevenLabsCoachAgent(config: ElevenLabsConfig) {
  agentPromise ??= provisionAgent(config).catch((cause) => {
    agentPromise = undefined;
    throw cause;
  });
  return agentPromise;
}

export async function createElevenLabsSignedUrl(config: ElevenLabsConfig) {
  const agentId = await ensureElevenLabsCoachAgent(config);
  const response = await elevenLabsRequest(
    config,
    `/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
  );
  return { agentId, signedUrl: signedUrlResponse.parse(await response.json()).signed_url };
}

export function resetElevenLabsAgentForTests() {
  agentPromise = undefined;
}
