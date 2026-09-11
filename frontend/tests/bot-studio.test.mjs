import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides an authenticated general agent builder with voice preview", async () => {
  const [page, studio, styles, landing, templates, workspace, workspaceStyles, specialistPage] = await Promise.all([
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BotStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BotStudio.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/domain/bots.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/SpecialistWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SpecialistWorkspace.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/bots/[botId]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /callbackUrl=\/studio/);
  assert.match(templates, /Interview Coach|interview_coach/);
  assert.match(templates, /Resume Reviewer|resume_reviewer/);
  assert.match(studio, /Create focused agents for customer, internal, voice, research, and guided web workflows/);
  assert.match(studio, /isVisibleTemplate/);
  assert.match(studio, /template\.id === "blank"/);
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
  assert.match(studio, /useRouter/);
  assert.match(studio, /router\.push\(`\/studio\/bots\/\$\{response\.bot\.id\}`\)/);
  assert.match(studio, /Open bot →/);
  assert.match(studio, /Activate & open bot/);
  assert.match(specialistPage, /await Promise\.all\(\[params, searchParams, auth\(\)\]\)/);
  assert.match(workspace, /\/v1\/bots\/\$\{bot\.id\}\/messages/);
  assert.match(workspace, /BotVoicePanel/);
  assert.match(workspace, /showTranscript=\{false\}/);
  assert.match(workspace, /className=\{styles\.chatActions\}[\s\S]*?<BotVoicePanel/);
  assert.match(workspaceStyles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(workspaceStyles, /messages:not\(\.emptyMessages\)::before/);
  assert.match(styles, /grid-template-areas:"orb title action"/);
  assert.match(workspace, /Live transcript/);
  assert.match(workspace, /practice workspace/);
  assert.match(workspace, /Attach/);
  assert.match(workspace, /Create PDF/);
  assert.match(workspace, /LIVE MARKET RESEARCH/);
  assert.match(workspace, /CURRENT JOB MATCHES/);
  assert.match(workspace, /Prepare application/);
  assert.match(workspace, /Find jobs/);
  assert.match(workspace, /evidence\.applicationSources/);
  assert.match(workspace, /Direct employer or ATS listings checked/);
  assert.match(workspace, /Review LinkedIn/);
  assert.match(workspace, /startLinkedInReview/);
  assert.match(workspace, /headline, About section, experience, skills, Featured section/);
  assert.match(workspace, /searchSuggestions/);
  assert.match(workspace, /attachmentIds/);
  assert.match(workspace, /Ready to send/);
  assert.match(workspace, /press Send ↑ to share/);
  assert.match(workspace, /messages, sending/);
  assert.match(workspace, /const submittedAttachments = pendingAttachments;[\s\S]*?setDraft\(""\);[\s\S]*?setPendingAttachments\(\[\]\);[\s\S]*?await Promise\.all\(submittedAttachments\.map\(uploadAttachment\)\)/);
  assert.match(workspace, /setDraft\(\(current\) => current\.trim\(\) \? current : content\)/);
  assert.match(workspaceStyles, /min-height: 0/);
  assert.match(workspaceStyles, /scroll-padding-block/);
  assert.match(workspace, /Enable read-only access/);
  assert.match(workspace, /Repo: \$\{repository\.repository\.name\}/);
  assert.match(workspace, /\/v1\/bots\/\$\{botId\}\/local-repository/);
  assert.match(workspaceStyles, /\.repositoryAccess/);
  assert.match(studio, /\/v1\/bots\/\$\{bot\.id\}\/live-turns/);
  assert.match(studio, /saveCompletedVoiceTurn\("gemini"\)/);
  assert.match(studio, /saveCompletedVoiceTurn\("elevenlabs"\)/);
  assert.match(workspace, /\.pdf,\.jpg,\.jpeg,\.png,\.webp/);
  assert.match(studio, /Resume/);
  assert.match(studio, /research_current_market/);
  assert.match(studio, /review_local_repository/);
  assert.match(studio, /Do not use for ordinary resume work or for a different project/);
  assert.match(studio, /const continuingConversation = credentials\.initialHistory\.length > 0/);
  assert.match(studio, /turnComplete: !continuingConversation/);
  assert.match(studio, /providerNote \|\| stateLabel/);
  assert.match(studio, /Live web research/);
  assert.match(studio, /Pause/);
  assert.doesNotMatch(workspace, /voiceRail|quickStarts/);
  assert.match(studio, /Voice recording is disabled|Private voice recording disabled/);
  assert.match(styles, /@media\(max-width:40rem\)/);
  assert.match(landing, /Build the agent/);
  assert.match(landing, /Agent Copilot/);
  assert.match(landing, /Review before release/);
  assert.match(landing, /Edge runtime in development/);
});

test("keeps Studio controls readable and free of inherited neon actions", async () => {
  const styles = await readFile(new URL("../components/BotStudio.module.css", import.meta.url), "utf8");

  assert.match(styles, /color-scheme:light/);
  assert.match(styles, /\.page :global\(\.ui-field\)[\s\S]*background:#fff[\s\S]*color:#173b3f/);
  assert.match(styles, /\.page :global\(\.ui-button--primary\)\{background:#173b3f/);
  assert.doesNotMatch(styles, /\.page :global\(\.ui-button--primary\)[^{]*\{[^}]*#(?:c8ff4b|d2ff58|b9ed38)/i);
});
