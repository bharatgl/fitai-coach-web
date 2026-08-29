import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElevenLabsCoachAgentConfig,
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
