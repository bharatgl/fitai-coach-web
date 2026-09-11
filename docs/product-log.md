# ForgeFit product log

This is the durable product-development and portfolio log for ForgeFit. Update it
after each scoped increment so product decisions, engineering evidence, and demo
readiness stay connected.

## Product direction

- Flagship: one end-to-end ForgeFit product, used to learn and demonstrate
  frontend, backend, AI, privacy/security, testing, deployment, and product
  judgment together.
- Current flagship improvement: voice-first onboarding.
- Target journey: a new member opts into voice or chooses typing, answers one
  question at a time, sees a structured profile draft update, can correct or
  skip answers, explicitly consents before optional sensitive fields are saved,
  confirms the final summary, and continues directly into first-plan generation.
- Product constraint: typing remains a complete fallback. Microphone or AI
  provider failure must not block onboarding or plan creation.

## Coaching and tracker handoff

- Coaching track name: `ForgeFit Product Development`.
- The shared live tracker is maintained only by the main interview coach. This
  track must not open for editing or write to the workbook, preventing
  simultaneous-edit conflicts.
- Keep detailed ForgeFit evidence in this product log. Do not infer that a
  lesson, exercise, mock, review, feature, or test is complete without evidence.
- When Bharat says **Sync update**, return exactly one factual record and no
  surrounding commentary, using this field order:

  `Date | Track | Activity | Evidence | Status (Ready/In Progress/Blocked/Logged/Done) | Blocker or improvement | Next action`

- Use the actual completion date and the fixed track value `ForgeFit Product
  Development`. Evidence must be a concrete artifact, command result, reviewed
  decision, or observed behavior. If evidence is incomplete, use `In Progress`
  or `Blocked`, not `Done`.
- This protocol was adopted on 2026-09-03. It is a workflow decision, not a
  completed learning activity, so it does not itself create a tracker record.

## 12-week ForgeFit coaching cadence — adopted 2026-09-03

ForgeFit stays active beside the DSA-first interview plan without competing for
its priority. The weekday budget is 30 minutes for this track. Each week targets
one demonstrable product outcome rather than a broad collection of tasks.

### Repeatable weekly rhythm

- Monday: define the week's user outcome, acceptance criteria, and smallest
  architecture boundary.
- Tuesday and Wednesday: make one narrow, explainable implementation increment
  when Bharat explicitly authorizes it.
- Thursday: add or strengthen the highest-value test and inspect failure paths.
- Friday: refactor only what the increment exposed; record the decision and a
  two-minute interview explanation.
- Saturday topic block: finish the vertical slice, run proportionate
  verification, and review the diff as if it were a pull request.
- Sunday light block: demo the current journey, capture factual evidence and
  blockers here, choose the next slice, and prepare a tracker record only if
  Bharat asks for **Sync update**.

If a weekday is missed, do not expand the next weekday beyond 30 minutes. Move
unfinished scope into Saturday or reduce the weekly outcome.

### Weekly outcomes

| Week | ForgeFit lesson and outcome | Evidence required before marking done |
| --- | --- | --- |
| 1 | Product slice: map voice-first onboarding states, field classes, consent boundary, and acceptance criteria against the existing code | Reviewed state diagram/decision notes and named first test cases |
| 2 | Frontend state: add the typed onboarding draft and pure reducer for set, correct, skip, review, consent, and confirm | Focused reducer tests passing; no persistence or provider coupling |
| 3 | Accessible UI: build the typing-first conversational shell with a continuously visible structured draft | Keyboard-complete walkthrough plus focused UI tests |
| 4 | Privacy UX: implement review, optional-sensitive-field consent, decline/drop behavior, and final confirmation | Tests prove nothing saves before confirmation and declined fields are omitted/reset |
| 5 | Backend boundary: validate the confirmed payload, consent metadata, ownership, and idempotent profile save contract | Route/domain tests cover invalid, repeated, declined, and cross-user cases |
| 6 | First value: hand confirmed profile save into recoverable plan generation and first-workout preview | Integration test proves save-once, retry-safe generation, and deterministic fallback visibility |
| 7 | Voice design: define an onboarding-specific short-lived session and schema-constrained proposed-update contract | Threat model, sequence diagram, provider-cost boundary, and contract tests |
| 8 | Voice adapter: add explicit opt-in, finalized-answer handling, correction/skip, and seamless typing fallback | Voice happy-path demo plus permission-denied/provider-failure tests |
| 9 | Safety and privacy: complete deterministic pre-response gating, cleanup, transcript/audio rules, and consent copy | Safety tests plus verified microphone/session cleanup paths |
| 10 | Journey quality: add authenticated browser E2E coverage and mobile/accessibility resilience checks | Repeatable onboarding-to-first-plan E2E and documented device/browser observations |
| 11 | Production thinking: add privacy-filtered funnel/latency signals, cost limits, feature kill switch, and deployment runbook updates | No-sensitive-content telemetry tests and a rehearsed failure/rollback path |
| 12 | Portfolio proof: polish the demo, quantify the outcome, review architecture tradeoffs, and prepare interview narratives | Short demo script, evidence-backed metrics, final architecture summary, and two practiced STAR stories |

### Progress discipline

- Status is based on evidence, not time spent. Partial code or an untested design
  remains `In Progress`.
- Record only ForgeFit work here: user outcome, files/behavior changed, tests,
  architecture decision, blocker, demo state, and interview takeaway.
- Do not claim provider-backed voice, production readiness, or mobile support
  from mocks or unit tests alone.
- Preserve the one-product rule: every lesson must improve the voice-first
  onboarding journey or the production foundation it directly depends on.

## Current product state — 2026-09-03

ForgeFit is an authenticated fitness-coaching monorepo with a Next.js frontend,
Fastify API, MongoDB persistence, a server-only multi-provider AI package, shared
TypeScript contracts, and separate deployment containers. It already supports:

- Google/Auth.js sign-in and a same-origin, short-lived-JWT backend proxy.
- A persisted training profile and 4/8/12-week adaptive plan generation with a
  deterministic fallback planner.
- Workout start, pause, resume, set logging, substitution, finish, history, and
  readiness check-ins.
- Persisted text-coach threads grounded in profile, plan, workout, readiness, and
  compact movement context.
- ElevenLabs live voice with Gemini Live fallback, transcript persistence,
  interruption/reconnect handling, and optional Simli avatar.
- Consent-gated camera activation, on-device pose processing, and explicit
  one-frame visual analysis.
- A large attributed exercise library and the separate Forge Studio bot builder.

The current first-run path is not voice-first. When `/v1/dashboard` returns no
profile, `FitAICoach.tsx` renders one long HTML form. Submitting it sends every
field in a single `PUT /v1/profile`; the API upserts the final profile and marks
onboarding complete immediately. The member then lands in the product and must
manually open Plan and select **Generate my plan**.

## Flagship gap analysis

| Requirement | Current behavior | Gap |
| --- | --- | --- |
| Opt-in voice | Voice is available only inside the post-onboarding coach | No first-run voice choice or onboarding session |
| Visible profile draft | Form fields are visible | No conversational draft model, progress, or per-answer provenance |
| Correction | User can edit form controls before submit | No voice correction intent or deterministic field update flow |
| Skip | Optional HTML inputs may be left blank | No explicit conversational skip action or skipped-field state |
| Sensitive-data consent | Copy says some fields are optional | No explicit consent checkpoint before optional sensitive data persists |
| Summary confirmation | Browser validation precedes one save | No review state or explicit final confirmation |
| First-plan handoff | User manually visits Plan and starts generation | No automatic, visible handoff after the confirmed save |
| Typing fallback | The current form works without voice | It is not yet the equivalent input mode for a shared onboarding state machine |

## Decisions

1. The browser owns an explicit onboarding state machine; the model never writes
   the profile or starts plan generation directly.
2. Voice and typing are two input adapters over the same structured draft and
   reducer. This keeps correction, skip, validation, consent, and tests
   deterministic.
3. No profile data is persisted while answers are being collected. Persist only
   after summary confirmation and the required sensitive-data consent decision.
4. Treat age, gender context, height, weight, dietary preference, body
   considerations, and movement/injury notes as optional sensitive fields for
   the onboarding consent checkpoint. Consent must name the data and purpose;
   declining drops those fields from the persisted payload without blocking the
   core journey.
5. Minimum plan-ready fields are goal/training phase, experience, equipment,
   training days per week, and session duration. Program length can keep the
   existing experience-based recommendation and remain editable in review.
6. The server remains authoritative for schema validation, ownership, rate
   limits, and persistence. A voice transcript is untrusted input, not a command.
7. Plan generation begins only after profile persistence succeeds. Its progress
   and deterministic fallback must be visible, with retry that does not resave
   or duplicate the profile.
8. Do not force the existing general live-coach agent into onboarding unchanged:
   it requires a coach thread and is prompted for open-ended coaching. Introduce
   an onboarding-specific session/tool contract when the deterministic draft UI
   is ready.

## Architecture notes

Current flow:

```text
dashboard has no profile
  -> long Onboarding form
  -> PUT /v1/profile (final record + onboardingCompletedAt)
  -> dashboard refresh
  -> member opens Plan
  -> POST /v1/plans/generate
```

Target flow:

```text
choose voice or type
  -> collect answer
  -> parse into a proposed field update
  -> deterministic validate/reduce
  -> render visible draft + correction/skip controls
  -> review required fields
  -> explicit optional-sensitive-data consent
  -> final summary confirmation
  -> PUT /v1/profile
  -> POST /v1/plans/generate
  -> first-plan preview
```

Recommended state model:

```text
choose_mode -> collecting -> reviewing -> consent -> confirming
            -> typing fallback                 -> saving -> generating -> complete
                                                        -> recoverable error
```

Implementation boundaries to preserve:

- `frontend`: onboarding reducer/state machine, draft UI, accessibility,
  correction/skip controls, voice/typing adapters, and handoff progress.
- `packages/contracts`: draft field/update/session contracts and consent metadata.
- `backend`: authenticated onboarding voice-session provisioning and any
  schema-constrained interpretation endpoint; final profile and plan endpoints
  remain authoritative.
- `ai`: narrow prompt/schema for interpreting one onboarding answer. It proposes
  field updates only and never receives authority to persist.

## Prioritized feature backlog

### P0 — thin, testable onboarding foundation

- Extract a typed `OnboardingDraft` plus a pure reducer for set, correct, skip,
  review, consent, and confirmation events.
- Split minimum plan-ready fields from optional sensitive fields and define
  neutral defaults for declined/skipped optional data.
- Render a two-pane first-run shell: current question/input and always-visible
  structured draft.
- Add a full keyboard/typing path before connecting a voice provider.
- Add reducer and UI contract tests, including correction after review and
  decline-sensitive-data behavior.

### P1 — voice adapter

- Add an explicit **Use voice** opt-in with microphone permission requested only
  after the member acts.
- Provision a short-lived onboarding-specific voice session; disable recording
  at the provider and bound duration/cost.
- Convert finalized answers into schema-constrained proposed updates, display
  them before acceptance, and support spoken “change …” and “skip”.
- Preserve draft state and switch to typing on permission denial, provider
  failure, reconnect exhaustion, or user choice.
- Apply the deterministic pre-response voice safety gate already identified in
  `docs/realtime-voice-coach.md` before public deployment.

### P2 — consent, persistence, and first value

- Add explicit consent UI listing populated optional sensitive fields and their
  purpose; persist consent version/time and the accepted field categories.
- Confirm a readable final summary and save exactly once with an idempotency key.
- Hand off to first-plan generation automatically and show generation/fallback
  status plus the first workout preview.
- Add retry semantics so generation failure never loses or duplicates the
  confirmed profile.

### P3 — production and evidence

- Add an authenticated browser E2E journey for voice success, typing fallback,
  correction, skip, consent decline, save, plan generation, and preview.
- Test microphone permission, interruption, reconnect, and accessibility on the
  supported mobile-browser matrix.
- Add privacy-filtered funnel and latency events without transcripts, health
  notes, audio, or profile values.
- Measure time-to-first-plan, onboarding completion, voice-to-typing fallback,
  correction rate, consent acceptance/decline, and generation success.

## Completed improvements

- Production-shaped monorepo boundaries and shared contracts.
- Authenticated, user-scoped profile/data access and persisted product shell.
- Schema-validated AI plan generation with deterministic fallback and
  transactional version materialization.
- End-to-end workout execution, readiness, progress, and coaching context.
- Persisted text coaching and real-time voice foundations with fallback and
  resource cleanup.
- On-device movement tracking and privacy-bounded camera analysis.
- Plan adjustment proposals and broad automated unit/contract coverage.
- 2026-09-03: established this product log and voice-first onboarding baseline;
  no application code changed.

## Test evidence

Baseline on branch `feat/architecture-revamp` at commit `c44ad24`, including the
existing uncommitted working tree:

- 2026-09-03: `npm run typecheck` — pass, 3 workspace tasks.
- 2026-09-03: `npm test` — pass, 4 workspace tasks; AI 34/34 and backend 83/83
  tests passed, with the frontend suite also passing.
- Not yet evidenced for the flagship: onboarding reducer/UI tests, authenticated
  onboarding-to-plan browser E2E, provider-backed voice onboarding, physical
  mobile microphone behavior, consent persistence, or time-to-first-plan.

## Demo readiness

- Existing core product: suitable for a controlled local demo if provider and
  database configuration are available.
- Voice-first onboarding: not demo-ready; it is a designed backlog with no
  implementation yet.
- Public beta: blocked by the launch gates in `docs/roadmap.md`, especially live
  voice safety gating, privacy/terms, authenticated E2E coverage, account
  export/deletion, observability, device calibration, backups, and load testing.

## Interview stories

### Story 1 — AI as proposer, application as authority

ForgeFit uses models for bounded proposals while deterministic TypeScript owns
validation, consent, persistence, and side effects. Voice onboarding extends
that rule: natural language can propose a draft update, but only the reducer and
server schema can accept it, and only the member's confirmation can save it.

### Story 2 — privacy as a product interaction

Instead of hiding consent in legal copy, the onboarding journey separates the
minimum data needed for a useful training plan from optional sensitive context.
The member sees exactly what was captured, can correct or skip it, and decides
whether the populated sensitive categories are saved.

### Story 3 — graceful AI degradation

Voice is an enhancement, not the availability boundary. The same draft state is
usable through typing, microphone denial does not lose progress, and validated
local plan generation preserves first value when the model provider fails.

### Story 4 — portfolio breadth without project sprawl

One journey demonstrates accessible React state design, shared API contracts,
Fastify authentication and validation, provider-safe AI integration, MongoDB
data modeling, consent/security decisions, automated tests, deployment, cost
controls, and measurable product outcomes.

## Next recommended increment

Implement only the P0 typed draft/reducer and its unit tests first. This is the
smallest vertical foundation that makes the form and future voice path share one
truth, exposes consent boundaries early, and is explainable in an interview
without coupling the first change to a paid voice provider.
