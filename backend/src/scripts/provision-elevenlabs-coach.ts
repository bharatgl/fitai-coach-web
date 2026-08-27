import { getConfig } from "../config.js";
import { ensureElevenLabsCoachAgent } from "../services/elevenlabs.js";

const agentId = await ensureElevenLabsCoachAgent(getConfig());
console.log(`ForgeFit ElevenLabs coach is ready: ${agentId}`);
