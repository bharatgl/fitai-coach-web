import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("shows a public landing page and protects the coaching workspace", async () => {
  const [page, landing, landingStyles, tokenFactory, apiClient, coach, movementTracker, liveVoice, liveCamera, liveVoiceProtocol] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/backend-token.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MovementTracker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LiveVoiceCoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LiveCoachCamera.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/live-voice.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /return <LandingPage \/>/);
  assert.match(landing, /href="\/signin"/);
  assert.match(landing, /Build strength/);
  assert.doesNotMatch(landing, /Adapt as you go/);
  assert.match(landing, /One focused training system/);
  assert.match(landing, /BrandLockup/);
  assert.match(landing, /On-device tracking/);
  assert.match(landingStyles, /@media \(max-width: 60rem\)/);
  assert.match(landingStyles, /@media \(max-width: 48rem\)/);
  assert.match(landingStyles, /@media \(max-width: 36rem\)/);
  assert.match(landingStyles, /@media \(max-width: 24rem\)/);
  assert.match(tokenFactory, /setExpirationTime\("5m"\)/);
  assert.match(tokenFactory, /setAudience\("fitai-backend"\)/);
  assert.match(apiClient, /\/api\/backend/);
  assert.match(coach, /\/v1\/dashboard/);
  assert.match(coach, /\/v1\/coach\/messages/);
  assert.match(coach, /sessionId: activeSessionId/);
  assert.match(coach, /\/v1\/coach\/threads/);
  assert.doesNotMatch(coach, /New chat/);
  assert.doesNotMatch(coach, /new-chat-button/);
  assert.doesNotMatch(coach, /thread-menu-trigger/);
  assert.match(coach, /coach-voice-first-workspace\$\{liveVoiceOpen \? " has-live-coach" : ""\}/);
  assert.match(coach, /className="coach-voice-home"/);
  assert.match(coach, /Start voice coaching/);
  assert.doesNotMatch(coach, /Use text chat/);
  assert.match(coach, /YOUR COACH IS ONLINE/);
  assert.doesNotMatch(coach, /AI COACH ONLINE|Message your AI coach/);
  assert.match(coach, /chat coach-chat-side\$\{liveVoiceOpen \? " is-live-chat" : ""\}/);
  assert.doesNotMatch(coach, /className="floating-coach-agent"/);
  assert.match(coach, /\/coach\/forge-coach-avatar\.webp/);
  assert.match(coach, /className="coach-suggestions"/);
  assert.match(coach, /messages\.length === 0 && !loadingThreads && !liveVoiceOpen/);
  assert.match(coach, /prompt-toggle-button/);
  assert.match(coach, /aria-expanded=\{showSuggestions\}/);
  assert.match(coach, /className="coach-suggestions active-coach-suggestions"[\s\S]*chat-composer/);
  assert.match(coach, /className="messages" ref=\{messagesRef\}/);
  assert.match(coach, /messageList\.scrollTop = messageList\.scrollHeight/);
  assert.match(coach, /composer-main/);
  assert.match(coach, /composer-tools/);
  assert.match(coach, /placeholder="Type a message…"/);
  assert.match(coach, /Save and resend/);
  assert.match(coach, /Attach images or PDF/);
  assert.match(coach, /\/v1\/coach\/attachments/);
  assert.match(coach, /MessageAttachments/);
  assert.match(coach, /Hold to dictate/);
  assert.doesNotMatch(coach, /speechSynthesis/);
  assert.match(coach, /Voice input uses your browser&apos;s speech service/);
  assert.match(coach, /Text input is always available/);
  assert.match(coach, /visibilitychange/);
  assert.match(coach, /recognitionRef\.current\?\.abort/);
  assert.doesNotMatch(coach, /MediaRecorder|audio\/webm/);
  assert.match(coach, /<svg width="20" height="20"/);
  assert.match(coach, /attachment-button voice-input-button/);
  assert.match(coach, /LiveVoiceCoach/);
  assert.match(coach, /loading: \(\) => <LiveVoiceCoachLoadingShell \/>/);
  assert.match(coach, /live-voice-loading-shell/);
  assert.match(coach, /autoStart/);
  assert.match(coach, /visualOnly/);
  assert.match(coach, /onActivityChange=\{setLiveCoachActivity\}/);
  assert.match(coach, /LIVE CHAT/);
  assert.match(coach, /Live transcript/);
  assert.match(coach, /live-chat-footer/);
  assert.match(liveVoice, /live-voice-panel live-voice-inline/);
  assert.match(liveVoice, /autoStartAttemptedRef/);
  assert.match(liveVoice, /const autoStartTimer = window\.setTimeout/);
  assert.match(liveVoice, /window\.clearTimeout\(autoStartTimer\)/);
  assert.match(liveVoice, /onActivityChange\?\.\(\{/);
  assert.match(liveVoice, /coach-voice-home coach-voice-home-live live-voice-panel/);
  assert.match(liveVoice, /coach-voice-home-live-actions/);
  assert.match(liveVoice, /setMicMuted\(nextPaused\)/);
  assert.match(liveVoice, /track\.enabled = !nextPaused/);
  assert.match(liveVoice, /Pause talking/);
  assert.match(liveVoice, /Resume talking/);
  assert.match(liveVoice, /Back to chat/);
  assert.doesNotMatch(liveVoice, /aria-modal|role="dialog"|className="live-voice-backdrop"/);
  assert.match(liveCamera, /live-camera-self-label/);
  assert.match(liveVoice, /BidiGenerateContentConstrained/);
  assert.match(liveVoice, /audio\/pcm;rate=16000/);
  assert.match(liveVoice, /get_live_workout_snapshot/);
  assert.match(liveVoice, /analyze_camera_view/);
  assert.match(liveVoice, /create_pdf_document/);
  assert.match(liveVoice, /\/v1\/coach\/generated-pdfs/);
  assert.match(liveVoice, /\/v1\/coach\/live-camera-analysis/);
  assert.match(liveVoice, /interrupted/);
  assert.match(liveVoice, /\/v1\/coach\/live-turns/);
  assert.match(liveVoice, /\/v1\/coach\/elevenlabs-session/);
  assert.match(liveVoice, /import\("@elevenlabs\/client"\)/);
  assert.match(liveVoice, /dynamicVariables: credentials\.dynamicVariables/);
  assert.match(liveVoice, /provider: voiceProviderRef\.current/);
  assert.match(liveVoice, /AbortSignal\.timeout\(25_000\)/);
  assert.match(liveVoice, /did not finish setup/);
  assert.match(liveVoice, /sessionResumption/);
  assert.match(liveVoice, /contextWindowCompression/);
  assert.match(liveVoice, /initialHistoryInClientContent/);
  assert.match(liveVoice, /Reconnecting without losing context/);
  assert.match(liveVoice, /movementSignalText/);
  assert.match(liveVoice, /decodeLiveServerMessage/);
  assert.match(liveVoice, /import\("simli-client\/dist\/client"\)/);
  assert.match(liveVoice, /\/v1\/coach\/live-avatar-token/);
  assert.match(liveVoice, /pcmForAvatar/);
  assert.match(liveVoice, /avatarClient\.sendAudioData/);
  assert.match(liveVoice, /<video/);
  assert.match(liveVoice, /playsInline/);
  assert.match(liveVoice, /\/coach\/forge-coach-avatar\.webp/);
  assert.match(liveVoice, /credentials\.voiceName/);
  assert.doesNotMatch(liveVoice, /voiceName: "Kore"/);
  assert.match(liveVoice, /Ready when you are/);
  assert.match(liveVoice, /<LiveCoachCamera/);
  assert.match(liveVoice, /live-coach-utterance/);
  assert.match(liveVoice, /live-coach-session-scroll/);
  assert.match(liveVoice, /showCoachContext/);
  assert.doesNotMatch(liveVoice, /live-voice-orb|live-voice-captions/);
  await access(new URL("../public/coach/forge-coach-avatar.webp", import.meta.url));
  assert.doesNotMatch(liveVoice, /JSON\.parse\(String\(event\.data\)\)/);
  assert.match(liveVoiceProtocol, /data instanceof Blob/);
  assert.match(liveVoiceProtocol, /await data\.text\(\)/);
  assert.match(liveVoiceProtocol, /new TextDecoder\(\)\.decode\(data\)/);
  assert.doesNotMatch(liveVoice, /speechSynthesis|MediaRecorder|audio\/webm/);
  assert.match(liveCamera, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(liveCamera, /CameraFacingMode = "user" \| "environment"/);
  assert.match(liveCamera, /facingMode: \{ ideal: requestedFacingMode \}/);
  assert.match(liveCamera, /Switch camera/);
  assert.match(liveCamera, /data-facing=\{facingMode\}/);
  assert.match(liveCamera, /@mediapipe\/tasks-vision/);
  assert.match(liveCamera, /\/v1\/coach\/live-snapshot/);
  assert.match(liveCamera, /\/movement-events/);
  assert.match(liveCamera, /Camera frames stay on your device|Private workout camera preview/);
  assert.match(liveCamera, /Turn camera on/);
  assert.match(liveCamera, /toDataURL\("image\/jpeg", 0\.72\)/);
  assert.match(liveVoice, /one compressed frame is analyzed securely and is not stored/);
  assert.match(coach, /className="ui-visually-hidden"/);
  assert.match(coach, /maxCoachAttachmentBytes/);
  assert.match(coach, /name="dietaryPreference"/);
  assert.match(coach, /name="trainingPhase"/);
  assert.match(coach, /name="programDurationWeeks"/);
  assert.match(coach, /12 weeks · periodized/);
  assert.match(coach, /plan-overview/);
  assert.match(coach, /plan-week-picker/);
  assert.match(coach, /plan-dashboard-layout/);
  assert.match(coach, /plan-schedule-table/);
  assert.match(coach, /plan-next-workout/);
  assert.match(coach, /PlanCoachPanel/);
  assert.match(coach, /planId,/);
  assert.match(coach, /weekNumber,/);
  assert.match(coach, /mostRecentActiveCoachThread\(response\.threads, "plan"\)/);
  assert.match(coach, /title: "Plan workspace", scope: "plan"/);
  assert.match(coach, /Separate planning chat · your Coach still sees the current plan/);
  assert.match(coach, /plan-profile-warning/);
  assert.match(coach, /Version history/);
  assert.match(coach, /PlanVersionCard/);
  assert.match(coach, /Restore as new/);
  assert.match(coach, /className="plan-history-summary"/);
  assert.match(coach, /Previous plans/);
  assert.match(coach, /className="plan-week-picker"/);
  assert.match(coach, /\/v1\/plans\/\$\{planId\}\/restore/);
  assert.match(coach, /minimumMovementsForProfile/);
  assert.match(coach, /This plan is under-prescribed/);
  assert.match(coach, /Plan generation is temporarily limited after repeated rebuilds/);
  assert.match(coach, /plan-quality-error/);
  assert.match(coach, /Needs rebuild/);
  assert.match(coach, /hasAdvancedRegression/);
  assert.match(coach, /beginner regression exercises as primary work/);
  assert.match(coach, /Legacy workout hidden/);
  assert.match(coach, /ExerciseVideoButton exerciseName=\{exercise\.name\} video=\{exercise\.video\}/);
  assert.match(coach, /Weekly schedule/);
  assert.match(coach, /startDate: localDateKey\(new Date\(\)\)/);
  assert.match(coach, /\/v1\/plans\/\$\{plan\.id\}\/reschedule/);
  assert.match(coach, /Work sets/);
  assert.match(coach, /Plan terms/);
  assert.match(coach, /Deload/);
  assert.match(coach, /className="session-status"/);
  assert.match(coach, /className="history-filters"/);
  assert.match(coach, /className="history-session-list"/);
  assert.match(coach, /Stopped before first set/);
  assert.match(coach, /\/v1\/plans\/generate/);
  assert.match(coach, /\/v1\/workouts\/\$\{plannedWorkoutId\}\/start/);
  assert.match(coach, /activeSession=\{activeSession\}[\s\S]*onResume=\{\(\) => setView\("workout"\)\}/);
  assert.match(coach, /if \(activeSession\) \{[\s\S]*onResume\(\);[\s\S]*return;/);
  assert.match(coach, /className="plan-active-session"/);
  assert.doesNotMatch(coach, /Resume current workout →/);
  assert.match(coach, /!activeSession && !primarySessionNeedsRefresh && primarySession\.status === "planned" && \(/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/sets/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/finish/);
  assert.match(coach, /WorkoutRunner/);
  assert.match(coach, /onBack=\{\(\) => setView\("plan"\)\}/);
  assert.match(coach, /Back to plan/);
  assert.match(coach, /Your workout stays in progress/);
  assert.match(coach, /Finish one workout to create your baseline/);
  assert.match(coach, /className="history-progress-overview"/);
  assert.match(coach, /className="history-analysis-grid"/);
  assert.match(coach, /Review my progress with coach/);
  assert.match(coach, /Incomplete attempts/);
  assert.match(coach, /Zero-set starts are kept for audit only and excluded from progress/);
  assert.match(movementTracker, /visibilitychange/);
  assert.match(movementTracker, /movementRuntimeSettings/);
  assert.match(movementTracker, /onLiveMovement/);
  assert.match(coach, /movementSignal=\{movementSignal\}/);
  assert.match(coach, /Live coach/);
});

test("contains no obsolete Cloudflare application entry points", async () => {
  const packageJson = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare/i);
  await assert.rejects(access(new URL("../vite.config.ts", import.meta.url)));
});

test("uses the shared responsive design system", async () => {
  const [layout, coach, styles, uiPackage, uiSource, uiStyles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/package.json", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/src/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /@fitai\/ui\/styles\.css/);
  assert.match(uiPackage, /"name": "@fitai\/ui"/);
  assert.match(uiSource, /export function Button/);
  assert.match(uiSource, /export function Field/);
  assert.match(uiSource, /export function PageHeader/);
  assert.match(uiStyles, /:focus-visible/);
  assert.match(uiStyles, /prefers-reduced-motion/);
  assert.match(uiStyles, /color-scheme: dark/);
  assert.match(uiStyles, /\.ui-button[\s\S]*border-radius: 0\.8rem/);
  assert.match(uiStyles, /backdrop-filter: blur\(24px\)/);
  assert.match(coach, /className="mobile-nav hidden"/);
  assert.match(coach, /className="mobile-header hidden"/);
  assert.match(coach, /aria-label="Primary navigation"/);
  assert.match(coach, /aria-current=/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(max-width:380px\)/);
  assert.match(styles, /@media\(min-width:48rem\)\{\.live-voice-backdrop/);
  assert.match(styles, /\.coach-workspace/);
  assert.match(styles, /\.plan-dashboard-layout/);
  assert.match(styles, /\.plan-schedule-table/);
  assert.match(styles, /\.plan-coach-panel/);
  assert.match(styles, /\.plan-history-comparison/);
  assert.match(styles, /\.plan-history-list/);
  assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /scroll-snap-type:x mandatory/);
  assert.match(styles, /\.plan-next-workout/);
  assert.match(styles, /\.plan-guide-grid/);
  assert.match(styles, /\.coach-suggestions/);
  assert.match(styles, /\.active-coach-suggestions\{margin-bottom:\.55rem\}/);
  assert.doesNotMatch(styles, /\.chat-composer \.composer-suggestions/);
  assert.match(styles, /\.composer-attachments/);
  assert.match(styles, /\.message-attachment-image/);
  assert.match(styles, /\.attachment-button\{[\s\S]*border-color:transparent[\s\S]*padding:0/);
  assert.match(coach, /message\.role === "assistant"[\s\S]*CoachMessageContent/);
  assert.match(styles, /\.messages \.coach-message-content p\{background:transparent/);
  assert.match(styles, /Final coach integration guards/);
  assert.match(styles, /\.coach-active \.messages article\.theirs \.message-body>\.coach-message-content\{/);
  assert.match(styles, /\.coach-active \.messages article\.theirs \.coach-message-content>p\{/);
  assert.match(styles, /\.coach-active \.chat \.chat-composer>\.prompt-toggle-button\{/);
  assert.match(styles, /forgefit\.space dark glass system/);
  assert.match(styles, /\.sidebar[\s\S]*backdrop-filter:blur\(28px\)/);
  assert.match(styles, /\.sidebar nav button[\s\S]*border-radius:\.8rem/);
  assert.match(styles, /box-shadow:inset 3px 0 #c8ff4b/);
  assert.match(styles, /\.session-status[\s\S]*align-self:start/);
  assert.match(styles, /\.plan-overview[\s\S]*radial-gradient/);
});
