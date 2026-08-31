import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides an authenticated personal-specialist bot builder with voice preview", async () => {
  const [page, studio, styles, landing, templates, workspace, specialistPage] = await Promise.all([
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BotStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BotStudio.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/domain/bots.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SpecialistWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/bots/[botId]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /callbackUrl=\/studio/);
  assert.match(templates, /Interview Coach|interview_coach/);
  assert.match(templates, /Resume Reviewer|resume_reviewer/);
  assert.match(studio, /No contact-center or customer-support workflows/);
  assert.match(studio, /\/v1\/bots\/\$\{saved\.id\}\/activate/);
  assert.match(studio, /Conversation\.startSession/);
  assert.match(studio, /connectionType: "websocket"/);
  assert.match(studio, /\/v1\/bots\/\$\{bot\.id\}\/live-token/);
  assert.match(studio, /BidiGenerateContentConstrained/);
  assert.match(studio, /live voice switched to Gemini Live automatically/);
  assert.match(studio, /thinkingLevel: "MEDIUM"/);
  assert.match(studio, /Gemini Live is the primary voice provider/);
  assert.match(studio, /sessionResumption: resumeHandle \? \{ handle: resumeHandle \} : \{\}/);
  assert.match(studio, /sessionResumptionUpdate/);
  assert.match(studio, /message\.goAway/);
  assert.match(studio, /scheduleGeminiReconnect/);
  assert.match(studio, /conversation continued automatically/);
  assert.match(studio, /Open workspace/);
  assert.match(specialistPage, /await Promise\.all\(\[params, auth\(\)\]\)/);
  assert.match(workspace, /\/v1\/bots\/\$\{bot\.id\}\/messages/);
  assert.match(workspace, /BotVoicePanel/);
  assert.match(workspace, /showTranscript=\{false\}/);
  assert.match(workspace, /Live transcript/);
  assert.match(workspace, /practice workspace/);
  assert.match(workspace, /Attach/);
  assert.match(workspace, /Create PDF/);
  assert.match(workspace, /LIVE MARKET RESEARCH/);
  assert.match(workspace, /searchSuggestions/);
  assert.match(workspace, /attachmentIds/);
  assert.match(workspace, /Ready to send/);
  assert.match(workspace, /press Send ↑ to share/);
  assert.match(studio, /\/v1\/bots\/\$\{bot\.id\}\/live-turns/);
  assert.match(studio, /saveCompletedVoiceTurn\("gemini"\)/);
  assert.match(studio, /saveCompletedVoiceTurn\("elevenlabs"\)/);
  assert.match(workspace, /\.pdf,\.jpg,\.jpeg,\.png,\.webp/);
  assert.match(studio, /Resume/);
  assert.match(studio, /research_current_market/);
  assert.match(studio, /Live web research/);
  assert.match(studio, /Pause/);
  assert.doesNotMatch(workspace, /voiceRail|quickStarts/);
  assert.match(studio, /Voice recording is disabled|Private voice recording disabled/);
  assert.match(styles, /@media\(max-width:40rem\)/);
  assert.match(landing, /One space/);
  assert.match(landing, /Forge Studio/);
  assert.match(landing, /Different goals/);
});
