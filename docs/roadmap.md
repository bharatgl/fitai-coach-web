# forgefit.space delivery roadmap

The milestones are ordered so that every feature uses authenticated, persisted
data and can be tested before the next capability depends on it.

## 1. Production-shaped foundation — implemented

- npm workspace monorepo orchestrated by Turborepo with separate `frontend/`
  and `backend/` applications.
- Isolated `ai/` package and shared `packages/contracts/` package.
- Next.js frontend and Fastify Node API, each packaged as its own Cloud Run
  container and built through Cloud Build.
- MongoDB clients reuse connection pools and create application indexes.
- Environment validation, API rate limiting, security headers, and health routes.

## 2. Authentication and profile — implemented and deployed

- Google sign-in through Auth.js with MongoDB-backed accounts and sessions.
- A same-origin frontend proxy uses five-minute signed JWTs for backend calls;
  those internal tokens never enter the browser.
- Backend verifies issuer, audience, signature, subject, and email.
- Real onboarding/profile reads and writes are scoped to the authenticated user.

## 3. Persisted product shell — implemented in code

- Dashboard, plan, history, and coach UI read API responses.
- Empty accounts show explicit empty states rather than sample workouts.
- User and assistant coach messages are persisted in MongoDB.

## 4. AI coach foundation — implemented in code

- AI provider APIs run only in the backend through provider adapters in `ai/`.
- Structured output is schema-validated before persistence.
- Deterministic urgent-symptom and pain checks run before model calls.
- Provider credentials and prompts remain server-only; deterministic safety checks run before every eligible model call.

## 5. Adaptive plan engine — implemented in code

- Curated equipment- and experience-aware exercise catalog.
- Four-week plan generation from goal, level, equipment, schedule, and movement notes.
- Structured model output plus deterministic exercise, duration, duplication, and volume validation.
- Transactional plan versioning: the previous plan is archived only when the new plan and all workouts persist successfully.
- Duplicate-generation lock, rate limit, provider error handling, and an isolated live E2E test that cleans up its Atlas records.

## 6. Workout execution and history — implemented in code

- Start, pause, resume, and finish scheduled workouts.
- Persist sets, reps, load, effort, substitutions, and session reflections.
- Recalculate progress and future workload from completed data.
- Enforce one active workout per user and optimistic concurrency on session updates.
- Include an isolated HTTP/Atlas E2E test with guaranteed record cleanup.
- Persist one self-reported readiness check-in per user and local date, including
  sleep, energy, soreness, stress, motivation, optional weight, and notes.
- Ground every coach response in a compact snapshot of the active plan, exact
  next-workout prescriptions, active session progress, recent completed work,
  and the latest dated readiness signal.
- Require detailed, auditable coaching answers with an explicit
  "Personalized from your data" evidence section and readable structured output.

## 7. Exercise demonstration videos — implemented in code

- Attach one reviewed YouTube demonstration to every exercise in the curated catalog.
- Add typed video metadata to plan and live workout API responses without allowing the AI model to invent links.
- Use a click-to-load, privacy-enhanced player with written coaching notes preserved as the prescribed source of truth.
- Keep demonstrations correct when exercises are substituted and backfill them in API responses for older stored plans.

## 8. Live movement intelligence — in progress

- Run pose estimation on-device so raw camera video is not uploaded.
- Convert joint landmarks into validated rep and range-of-motion events.
- Send only compact event summaries to the API.
- Add consent, camera-off behavior, and confidence thresholds.
- Complete camera and rep-threshold testing across the supported mobile and
  desktop device/browser matrix before deployment.
- Add validated movement summaries to live AI coach context after device
  thresholds are calibrated.

## 9. Voice experience — implemented in code

- Add explicit push-to-talk transcription and optional spoken responses.
- Show recording state, provide text alternatives, and avoid background capture.
- Keep microphone capture browser-managed and stop recognition on release or
  navigation; no audio is uploaded to or stored by forgefit.space.
- Degrade to the existing text composer when browser speech APIs are unavailable.
- Plan the gated Gemini Live upgrade in
  [`realtime-voice-coach.md`](realtime-voice-coach.md) before enabling continuous
  audio or read-only live workout tools.

## 10. Production operations

- API integration, authorization, AI safety, and browser end-to-end tests.
- Error monitoring, product analytics with sensitive-field filtering, backups,
  restore drills, cost limits, audit logs, accessibility, and load tests.

## Product and stability audit — 2026-08-28

ForgeFit has a credible authenticated strength-training foundation, but it is
not yet a stable bodybuilding or fat-loss product. The current product can
generate a conservative four-week plan, run and log workouts, calculate simple
load guidance, collect self-reported readiness, and ground text or live coaching
in that data. Bodybuilding, fat loss, and contest preparation currently exist
mainly as free-text goals and coaching instructions rather than first-class
product workflows.

The public deployment and database readiness endpoint are reachable. Local
typechecking, linting, the production build, and the automated unit/contract
suite pass. These checks do not validate production OAuth, authenticated
end-to-end journeys, paid AI-provider behavior, real voice/avatar sessions, or
camera calibration on physical devices.

### Launch blockers — do before inviting public traffic

- Complete the deterministic safety gate before any live model can respond to a
  finalized voice turn. Text safety checks do not protect direct native-audio
  output.
- Move production fitness, body, movement, and nutrition context off AI free
  tiers whose data terms are unsuitable for real member information.
- Add production error monitoring, privacy-filtered product analytics, provider
  latency/error metrics, per-member usage accounting, quota alerts, and feature
  kill switches for voice, avatar, vision, and plan generation.
- Exercise the real signed-in path in browser tests: sign in, onboarding, plan
  generation, readiness, workout start/log/pause/resume/finish, history, text
  coach, voice fallback, camera consent, and account sign-out.
- Test supported iOS Safari, Android Chrome, and desktop browsers on physical
  devices. Define measurable camera framing, confidence, rep-count, battery,
  thermal, microphone, interruption, and reconnect acceptance thresholds.
- Publish accurate Privacy and Terms pages. Explain separately that continuous
  pose tracking stays on-device while one compressed frame leaves the device
  only after an explicit visual-analysis request and is not retained.
- Add account deletion and data export covering Auth.js records, profiles,
  readiness, plans, sessions, movement summaries, coach threads, messages, and
  attachments. Verify deletion rather than relying on a UI-only acknowledgement.
- Restrict the initial product to adults until consent and data handling for
  minors have received an appropriate legal and safety review.
- Configure MongoDB backups and complete a restore drill. Document recovery
  time, recovery point, secret rotation, and provider-outage procedures.
- Load-test the uncached public landing route, authenticated proxy, database
  connection pool, synchronous plan generation, and voice-session provisioning.
  Preserve text coaching and workout logging when optional providers are down.
- Replace the long first-run form with progressive profiling and generate the
  first plan automatically after the minimum goal, experience, equipment,
  schedule, and session-duration inputs.

### Bodybuilding foundation — required for a real hypertrophy product

- Imported the full 1,324-exercise OpenGym source library as searchable,
  paginated MIT metadata with English instructions and pinned provenance. The
  restricted Gym Visual images/GIFs are intentionally excluded, and imported
  entries remain plan-ineligible until ForgeFit review is complete.
- Added a public and signed-in browser covering 1,725 unique movements by
  combining the entire 1,324-record reference source with all 250 commercially
  usable RepDB free-tier exercises. It includes 459 referenced WebP
  illustrations, text guides across the reference library, search, filters,
  setup instructions, visible attribution, pinned provenance, and license
  guards. Added all 302 Workout Guide exercises and 906 open CC BY-SA SVG
  frames as consistent three-position demonstrations with full provenance. The
  visual demo browser and compact full directory are separate views so records
  from different sources are not mixed into one inconsistent card grid.
- Replace the free-text-only goal with a versioned training phase:
  `muscle_gain`, `fat_loss`, `recomposition`, `maintenance`, or supervised
  `contest_prep`, including start date, optional target date, and member intent.
- Expand the reviewed catalog beyond the current small general-strength set.
  Add machine, cable, isolation, and common commercial-gym movements with muscle
  groups, stimulus role, fatigue cost, equipment, substitutions, setup cues,
  contraindication notes, and reviewed demonstrations.
- Bootstrap catalog research from a source with explicit commercial media terms,
  then review every imported movement before making it plan-eligible. RepDB's
  free dataset currently permits commercial in-app use with visible attribution;
  wger exposes per-entry Creative Commons licensing. Do not ship media from
  repositories that merely label scraped or purchased footage as MIT/public
  domain without proving the original media rights. Self-host approved assets
  instead of treating GitHub raw URLs as a production CDN.
- Model per-muscle weekly volume, exercise order, rep targets, RIR/RPE, rest,
  tempo, warm-ups, progression rules, deload triggers, and mesocycle history.
- Track personal exercise performance and rep-range progression rather than
  deriving future load from only the most recently completed sets.
- Add weekly check-ins for performance, soreness, recovery, schedule adherence,
  and member feedback. Apply bounded, auditable adjustments instead of silently
  regenerating an unrelated four-week plan.
- Support program edits such as moving a session, replacing an exercise,
  reducing duration, or changing volume without archiving and rebuilding the
  whole plan.
- Add meaningful physique progress views: strength trends, completed volume,
  adherence, and optional body measurements. Progress photos require explicit
  consent, private storage, retention controls, and deletion.

### Sustainable fat-loss journey — required before claiming fat-loss coaching

- Add weight entries and a rolling trend so recommendations do not react to a
  single noisy measurement. Keep weigh-ins optional and avoid moral language.
- Add an evidence-based starting-target workflow for energy and protein with
  explicit assumptions, unit handling, dietary preference, allergies, food
  availability, and a clear non-medical scope. Targets must be deterministic and
  reviewable rather than invented by the language model.
- Track adherence using weekly summaries instead of requiring perfect daily food
  logging. Include optional waist/measurement trends, steps, and cardio minutes.
- Add bounded adjustment rules based on several weeks of weight trend,
  adherence, hunger, recovery, and performance. Prevent rapid-loss targets and
  repeated automatic reductions.
- Provide India-relevant vegetarian, eggetarian, vegan, and non-vegetarian meal
  templates with editable portions and substitutions. Do not present generated
  meal examples as clinical diet prescriptions.
- Preserve resistance-training performance and recovery as first-class outcomes;
  do not turn fat loss into a scale-only score or punitive exercise target.

### Natural contest-preparation support — supervised and safety-bounded

- Model show date, weeks out, federation/division notes, prior prep experience,
  current support team, posing practice, and weekly check-in cadence.
- Keep the product focused on organization, gradual trend monitoring, training,
  meal adherence, posing practice, and questions for the member's coach,
  dietitian, or physician.
- Continue to block dehydration, water cuts, diuretics, laxatives, purging,
  extreme heat, severe restriction, and performance-enhancing drug protocols in
  text, voice, attachments, and camera-triggered flows.
- Do not estimate exact body-fat percentage, diagnose a condition, or declare
  stage readiness from a photo. Visual comparisons must state lighting, pose,
  clothing, angle, and framing limitations.
- Add escalation and recovery guidance for dizziness, fainting, neurological or
  breathing symptoms, severe pain, disordered-eating signals, menstrual-cycle
  disruption concerns, and other signs that require qualified care.

### Commercial launch foundation

- Add subscription entitlements and server-enforced limits for plan generation,
  text turns, attachment/vision analysis, live voice minutes, and avatar minutes.
- Record cost per successful plan, coach turn, voice minute, avatar minute, and
  activated member before offering an unlimited tier.
- Add pricing, trial state, billing lifecycle, invoices, failed-payment handling,
  cancellation, and support contact surfaces.
- Add Product Hunt assets only after the product gates pass: a working free or
  trial experience, real product screenshots, a short walkthrough, a clear
  privacy explanation, and a monitored launch-day capacity plan.

## Release gates

The public beta is ready only when all of the following are measured rather than
assumed:

- A new adult member can reach a generated plan and preview the first workout in
  under two minutes without support.
- The complete authenticated workout lifecycle passes against an isolated
  production-shaped database and in at least one automated browser journey.
- Voice connection, interruption, transcript persistence, safety gating,
  fallback, and resource cleanup pass on the supported mobile browser matrix.
- Camera tracking clearly rejects bad framing or low confidence and never claims
  to assess what it cannot see.
- Provider failures do not corrupt plans, sessions, messages, or billing usage.
- Monitoring contains no coach content, body notes, camera frames, auth tokens,
  provider credentials, or other sensitive free text.
- Backups restore successfully, account deletion is verified, cost caps are
  active, and a documented rollback can be executed during a launch.
