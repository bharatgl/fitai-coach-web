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

- Gemini API runs only in the backend through `ai/`.
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

## 9. Voice experience

- Add explicit push-to-talk transcription and optional spoken responses.
- Show recording state, provide text alternatives, and avoid background capture.

## 10. Production operations

- API integration, authorization, AI safety, and browser end-to-end tests.
- Error monitoring, product analytics with sensitive-field filtering, backups,
  restore drills, cost limits, audit logs, accessibility, and load tests.
