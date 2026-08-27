import assert from "node:assert/strict";
import test from "node:test";
import { buildElevenLabsCoachAgentConfig } from "../src/services/elevenlabs.js";

test("builds a private personalized Indian-English ElevenLabs coach", () => {
  const config = buildElevenLabsCoachAgentConfig({
    ELEVENLABS_API_KEY: "server-only-key",
    ELEVENLABS_AGENT_ID: undefined,
    ELEVENLABS_VOICE_ID: undefined,
    ELEVENLABS_LLM_MODEL: "gemini-2.5-flash",
  });
  const serialized = JSON.stringify(config);

  assert.equal(config.name, "ForgeFit Personal Coach");
  assert.match(config.conversation_config.agent.first_message, /\{\{user_name\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{member_context\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /\{\{conversation_history\}\}/);
  assert.match(config.conversation_config.agent.prompt.prompt, /natural Indian English/);
  assert.equal(config.conversation_config.tts.voice_id, "SQ8WYwlpzxrTbbuJgi38");
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
