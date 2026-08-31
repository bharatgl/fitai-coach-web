import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElevenLabsCoachAgentConfig,
  buildElevenLabsStudioAgentConfig,
  elevenLabsQuotaAvailability,
} from "../src/services/elevenlabs.js";

test("builds a private personalized Indian-English ElevenLabs coach", () => {
  const config = buildElevenLabsCoachAgentConfig({
    ELEVENLABS_API_KEY: "server-only-key",
    ELEVENLABS_AGENT_ID: undefined,
    ELEVENLABS_VOICE_ID: undefined,
    ELEVENLABS_LLM_MODEL: "gemini-2.5-flash",
  });
  const serialized = JSON.stringify(config);

  assert.equal(config.name, "ForgeFit Personal Coach");
  assert.match(config.conversation_config.agent.first_message, /\{\{session_opening\}\}/);
  assert.equal(config.conversation_config.agent.first_message, "{{session_opening}}");
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{member_context\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{conversation_history\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{current_local_datetime\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{user_timezone\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /natural Indian English/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Do not start with bro, bhai, veere/);
  assert.match(config.conversation_config.agent.prompt.prompt, /emotionally neutral delivery/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Never assume they are working out/);
  assert.match(config.conversation_config.agent.prompt.prompt, /without agreeing automatically/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Never tease, flirt, use sarcasm/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Use the recent conversation to avoid repetition/);
  assert.match(config.conversation_config.agent.prompt.prompt, /latest explicit statement about their current intent and timing/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Allow ordinary conversation/);
  assert.match(config.conversation_config.agent.prompt.prompt, /will train tomorrow or later/);
  assert.match(config.conversation_config.agent.prompt.prompt, /previous-day plan to sleep is historical/);
  assert.equal(config.conversation_config.agent.prompt.temperature, 0.35);
  assert.equal(config.conversation_config.tts.voice_id, "nPczCjzI2devNBz1zQrb");
  assert.equal(config.conversation_config.tts.model_id, "eleven_flash_v2");
  assert.equal(config.conversation_config.tts.speed, 0.96);
  assert.match(config.conversation_config.agent.prompt.prompt, /comfortable lower register/);
  assert.equal(config.conversation_config.tts.agent_output_audio_format, "pcm_16000");
  assert.deepEqual(config.conversation_config.conversation.client_events, [
    "audio",
    "user_transcript",
    "agent_response",
    "agent_response_correction",
    "interruption",
    "agent_response_complete",
  ]);
  assert.equal(config.platform_settings.auth.enable_auth, true);
  assert.match(serialized, /get_live_workout_snapshot/);
  assert.match(serialized, /analyze_camera_view/);
  assert.match(serialized, /review_recent_attachment/);
  assert.match(serialized, /create_pdf_document/);
  assert.match(config.conversation_config.agent.prompt.prompt, /configured AI provider to inspect the actual file/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Never ask the member to paste its text/);
  assert.match(config.conversation_config.agent.prompt.prompt, /download is visible in the chat/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Never say you cannot see/);
  assert.match(config.conversation_config.agent.prompt.prompt, /exact body-fat percentage/);
  assert.doesNotMatch(serialized, /server-only-key/);
});

test("honors an explicitly configured ElevenLabs voice", () => {
  const config = buildElevenLabsCoachAgentConfig({
    ELEVENLABS_API_KEY: "server-only-key",
    ELEVENLABS_AGENT_ID: "agent-id",
    ELEVENLABS_VOICE_ID: "custom-voice-id",
    ELEVENLABS_LLM_MODEL: "gemini-2.5-flash",
  });

  assert.equal(config.conversation_config.tts.voice_id, "custom-voice-id");
});

test("detects an exhausted ElevenLabs quota and reports its reset delay", () => {
  const availability = elevenLabsQuotaAvailability({
    character_count: 10_000,
    character_limit: 10_000,
    next_character_count_reset_unix: 1_700_003_600,
  }, 1_700_000_000_000);

  assert.deepEqual(availability, { exhausted: true, retryAfterSeconds: 3_600 });
  assert.deepEqual(elevenLabsQuotaAvailability({
    character_count: 9_999,
    character_limit: 10_000,
  }), { exhausted: false, retryAfterSeconds: null });
});

test("builds a private, focused Studio agent from a bot definition", () => {
  const config = buildElevenLabsStudioAgentConfig({
    ELEVENLABS_API_KEY: "server-only-key",
    ELEVENLABS_AGENT_ID: undefined,
    ELEVENLABS_VOICE_ID: "workspace-voice",
    ELEVENLABS_LLM_MODEL: "gemini-2.5-flash",
  }, {
    id: "bot-123456789",
    slug: "interview-coach-123456",
    name: "Interview Coach",
    description: "Practice interviews",
    vertical: "interview",
    status: "draft",
    instructions: {
      personality: "A calm and candid interview coach.",
      goal: "Run realistic interviews and give specific feedback.",
      boundaries: "Never invent a candidate's experience or promise an offer.",
      firstMessage: "What role are you preparing for?",
    },
    context: {
      audience: "A backend engineer preparing for a senior role",
      personalContext: "Five years of TypeScript and distributed-systems experience.",
      referenceMaterial: "The target role emphasizes API design and system reliability.",
    },
    voice: { enabled: true, voiceId: null, turnEagerness: "patient" },
    capabilities: { documentReview: true, knowledgeBase: true, webResearch: true },
    starterPrompts: ["Run a mock interview"],
    providerAgentId: null,
    lastSyncedAt: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  });
  const serialized = JSON.stringify(config);

  assert.equal(config.name, "Forge Studio · Interview Coach · bot-12");
  assert.equal(config.conversation_config.agent.first_message, "What role are you preparing for?");
  assert.equal(config.conversation_config.turn.turn_eagerness, "patient");
  assert.equal(config.conversation_config.tts.voice_id, "workspace-voice");
  assert.match(config.conversation_config.agent.prompt.prompt, /# Personality/);
  assert.match(config.conversation_config.agent.prompt.prompt, /# Boundaries/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Five years of TypeScript/);
  assert.match(config.conversation_config.agent.prompt.prompt, /system reliability/);
  assert.match(config.conversation_config.agent.prompt.prompt, /untrusted content/);
  assert.match(config.conversation_config.agent.prompt.prompt, /# ForgeFit product knowledge/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Never ask the user to explain ForgeFit back to you/);
  assert.match(config.conversation_config.agent.prompt.prompt, /Roman-script Hinglish/);
  assert.match(config.conversation_config.agent.prompt.prompt, /executive-grade personal copilot/);
  assert.match(config.conversation_config.agent.prompt.prompt, /ready-to-say wording/);
  assert.equal(config.platform_settings.auth.enable_auth, true);
  assert.equal(config.platform_settings.privacy.record_voice, false);
  assert.equal(config.platform_settings.guardrails.focus.is_enabled, true);
  assert.equal(config.platform_settings.guardrails.prompt_injection.is_enabled, true);
  assert.match(serialized, /research_current_market/);
  assert.doesNotMatch(serialized, /server-only-key/);
});
