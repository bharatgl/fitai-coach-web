# FitAI Coach delivery roadmap

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

## 2. Authentication and profile — implemented in code

- Google sign-in through Auth.js with MongoDB-backed accounts and sessions.
- A same-origin frontend proxy uses five-minute signed JWTs for backend calls;
  those internal tokens never enter the browser.
- Backend verifies issuer, audience, signature, subject, and email.
- Real onboarding/profile reads and writes are scoped to the authenticated user.

Deployment credentials and the MongoDB Atlas network policy still need to be
configured before this milestone is live.

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

Readiness check-ins and automatic next-session revisions will be added after
workout execution supplies real completion and effort data.

## 6. Workout execution and history — next

- Start, pause, resume, and finish scheduled workouts.
- Persist sets, reps, load, effort, substitutions, and session reflections.
- Recalculate progress and future workload from completed data.

## 7. Live movement intelligence

- Run pose estimation on-device so raw camera video is not uploaded.
- Convert joint landmarks into validated rep and range-of-motion events.
- Send only compact event summaries to the API/AI coach.
- Add consent, camera-off behavior, confidence thresholds, and device testing.

## 8. Voice experience

- Add explicit push-to-talk transcription and optional spoken responses.
- Show recording state, provide text alternatives, and avoid background capture.

## 9. Production operations

- API integration, authorization, AI safety, and browser end-to-end tests.
- Error monitoring, product analytics with sensitive-field filtering, backups,
  restore drills, cost limits, audit logs, accessibility, and load tests.
