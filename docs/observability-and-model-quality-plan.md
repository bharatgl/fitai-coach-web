# Observability, Response Quality, and Cost Engineering Plan

Status: in progress. See **Delivered so far** below for what has landed.
Scope: `ai/`, `backend/`, `frontend/app/api/backend`, `infra/gcp/`.
Audience: whoever builds and operates ForgeFit in production.

## Delivered so far

The first slice of Stages 1 and 2 is implemented and documented in
[`architecture.md`](architecture.md#observability):

- **Correlation.** One validated `x-request-id` spans browser, Next proxy,
  Fastify, and every model call. The proxy now logs and no longer echoes internal
  error messages to the browser.
- **Instrumented AI boundary.** `generateGeminiStructured` captures
  `usageMetadata`, wall-clock duration, and USD cost, and emits one versioned
  `ai.run` record per call — success or failure — through an injected sink.
- **Failure taxonomy.** `empty_response`, `malformed_json`, `schema_violation`,
  and `timeout` are now distinct from `unavailable`, with `retryable` derived
  from the class. A schema violation records the failing field path and Zod
  code, never the value. User-facing messages are unchanged.
- **Per-feature timeouts** (coach 30s, plan 120s, vision 20s) and a reused
  provider client.
- **Pricing table** (`ai/src/pricing.ts`) with per-model rates, cache-read rates,
  and long-context tiers. An unpriced model records tokens and reports
  `costMicroUsd: null` rather than implying the call was free.
- **`npm run ai:report`** aggregates `ai.run` lines into per-feature, per-model
  volume, failure rate by class, p50/p95 latency, tokens, cost, and cost per
  *successful* response.

Three decisions were taken that change later stages:

1. **Run records are log lines, not a collection.** No `aiRuns` in MongoDB and no
   log shipping — this is a zero-budget project. `scripts/ai-runs-report.mjs` is
   the query layer. The trade-off is real and is restated in Stage 0 below:
   container logs are a 30 MB rotating buffer that dies with the VM, so anything
   worth keeping has to be exported before then. The telemetry sink is injected,
   so adding a durable sink later is a change at the call site, not in `ai/`.
2. **Cost is computed, not deferred.** Prices are checked in with a `verifiedOn`
   date rather than fetched, so a run recorded last month keeps the price that
   was in force when it ran.
3. **Timeouts landed; retry did not.** Retry changes cost and latency and is
   better decided once the failure classes above have produced real data.

Still open from Stages 1–2: business-event logging beyond the AI path, a
`/metrics` endpoint, and counting the `local-fallback:validation` rate that
Stage 2 makes queryable.



This plan starts from what the repository actually does today, names the gaps
precisely, and then sequences the work so that each stage is independently
shippable and produces a signal the next stage consumes. The ordering is
deliberate: **you cannot evaluate models you cannot measure, and you cannot
measure what you never recorded.**

---

## Part 1 — Where the system stands today

### 1.1 The AI surface

Every model call in the product funnels through one function:

| Feature | Entry point | Model call | Output ceiling |
| --- | --- | --- | --- |
| Text coach | `backend/src/routes/coach.ts:1013` → `generateReply` (`:444`) | `generateCoachResponse` (`ai/src/coach.ts:194`) | 3,500 tokens |
| Plan generation | `backend/src/routes/plans.ts:34` | `generateAdaptivePlan` (`ai/src/plan.ts:279`) | 32,000 tokens |
| Camera frame analysis | `backend/src/routes/coach.ts:812` | `analyzeCameraFrame` (`ai/src/vision.ts:62`) | 900 tokens |
| Live voice (Gemini) | `backend/src/routes/coach.ts:762` | `createLiveCoachToken` (`ai/src/live.ts:17`) — token minted, session runs **browser↔Google** | n/a |
| Live voice (ElevenLabs) | `backend/src/routes/coach.ts:702` | `createElevenLabsSignedUrl` — session runs **browser↔ElevenLabs** | n/a |

The first three share `generateGeminiStructured` (`ai/src/gemini.ts:40`). That
single function is the highest-leverage instrumentation point in the codebase.
The last two are structurally different: the model call never touches our
servers, so the only observable artifacts are the token/session grant and the
transcripts posted back to `/v1/coach/live-turns` (`coach.ts:850`).

### 1.2 What is genuinely good already

These are load-bearing and the plan should extend them, not replace them.

- **Deterministic pre-model safety gate.** `classifySafetyMessage`
  (`ai/src/safety.ts`) short-circuits emergency, pain, and unsafe contest-prep
  messages *before* any model call, and returns a fixed reply. This is the right
  architecture: it is testable, has zero variance, and costs nothing.
- **A real domain validator for plans.** `validatePlanDraft`
  (`backend/src/domain/plans.ts:46`) enforces week completeness, day counts,
  unique day offsets, session duration, exercise-count and working-set bands from
  `planVolumeTargetsFor`, catalog membership, disallowed maximal prescriptions,
  and week-over-week duplication. This is a proper output contract, not a vibe
  check.
- **A validated deterministic fallback.** `buildDeterministicPlan`
  (`ai/src/plan.ts:88`) produces a profile-matched plan without the model, and it
  is pushed through the *same* validator before persistence
  (`plans.ts:118`, `:117`). Plan generation therefore has no hard dependency on
  model availability.
- **Fallback reason is already recorded.** `plans.ts:103` writes
  `local-fallback:<reason>` and `:126` writes `local-fallback:validation` into
  `WorkoutPlanDocument.model`. **This is a latent quality metric that nobody is
  counting.** The rate of `local-fallback:validation` is, today, the single best
  available proxy for "how often does the model produce an unusable plan" — and
  it is sitting in MongoDB unqueried.
- **Provider quota awareness exists for one provider.** `elevenLabsQuotaAvailability`
  (`backend/src/services/elevenlabs.ts:38`) reads `character_count` against
  `character_limit` and returns a `retryAfterSeconds`. There is no Gemini
  equivalent.
- **Structured output everywhere.** All three synchronous calls use
  `responseJsonSchema` + Zod parse. Malformed output fails closed rather than
  reaching the user.

### 1.3 The gaps, with evidence

**Observability**

1. **No AI call is timed, counted, or costed.** `generateGeminiStructured`
   (`ai/src/gemini.ts:46`) calls `generateContent` and immediately reads
   `response.text` (`:58`). `response.usageMetadata` — which carries
   `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`,
   `cachedContentTokenCount`, `totalTokenCount` — **is discarded**. No wall-clock
   duration is measured. There is no record that a call happened at all beyond
   the `model` string stamped on the resulting document.
2. **Failure modes are collapsed into one opaque error.** `gemini.ts:65-71`
   maps `SyntaxError` (model emitted non-JSON) and `ZodError` (model emitted
   valid JSON that violated the contract) to the *same* `AiProviderError(...,
   "unavailable")` as an empty response. These are three different engineering
   problems — a parser issue, a prompt/schema issue, and a provider issue — and
   they are indistinguishable in production. The offending raw output is
   discarded, so a schema violation can never be diagnosed after the fact.
3. **No timeout and no retry on the model call.** There is no `abortSignal` on
   `generateContent` (contrast `ai/src/live.ts:23`, which correctly sets a 20s
   timeout, and `services/elevenlabs.ts:73`, which sets 20s). A hung Gemini
   request is bounded only by the frontend proxy's 60s `AbortSignal.timeout`
   (`frontend/app/api/backend/[...path]/route.ts:43`) — the backend request keeps
   running after the client is gone. There is no retry for transient 429/503,
   which is the most common recoverable failure on a rate-limited tier.
4. **A new `GoogleGenAI` client is constructed per call** (`gemini.ts:43`),
   discarding connection reuse.
5. **Logging is Fastify's default, unconfigured.** `backend/src/app.ts:19` sets
   `logger: config.NODE_ENV !== "test"` and nothing else: no `redact` paths, no
   custom serializers, no level from env, no `genReqId`. There is no
   business-event logging anywhere — only four incidental `request.log.warn`
   calls, all in the Simli/ElevenLabs paths (`coach.ts:677`, `:684`, `:692`,
   `:743`) plus two in plan fallback (`plans.ts:100`, `:124`).
6. **The frontend proxy logs nothing at all.** `route.ts` catches every failure
   and returns `{ error: error.message }` with status 502 (`:57-60`). The
   internal message is echoed to the browser and never recorded server-side. A
   backend outage is invisible from the frontend's own telemetry.
7. **No correlation ID crosses the tiers.** The browser, the Next.js proxy, the
   Fastify backend, and the Gemini call share no identifier. Debugging a single
   user complaint requires guessing from timestamps.
8. **Production logs never leave the VM and are capped at ~30 MB per container.**
   `infra/gcp/vm/deploy-backend.sh:62` uses the docker `json-file` driver with
   `max-size=10m --log-file 3`, and `infra/gcp/vm/startup.sh` installs no Ops
   Agent. The deploy service account has `roles/logging.logWriter`
   (`infra/gcp/bootstrap.sh:70`) but nothing writes to Cloud Logging. Logs are
   destroyed on VM replacement. **In practice, production today has no log
   retention and no queryable log store.**
9. **No metrics endpoint, no traces, no error tracker.** `docs/architecture.md:208`
   recommends Sentry as "the first operational integration"; `docs/roadmap.md:119`
   lists "provider latency/error metrics, per-member usage accounting, quota
   alerts, and feature kill switches" as a launch blocker. Neither exists.
10. **Health checks do not reflect AI health.** `/health/ready` (`app.ts:27`)
    pings MongoDB only. The service reports ready while every model call is
    failing.

**Quality and validation**

11. **Coach replies receive no output-side validation.** The safety classifier
    runs on the *user's message* only (`ai/src/coach.ts:194`). Nothing inspects
    what the model produced. The Zod schema constrains shape (`coach.ts:6-19`)
    but not content, and `ensurePlanChangeConfirmation` (`:135`) is a regex
    heuristic that appends a question — useful, but not validation.
12. **Vision output is unchecked against its own prompt.** `ai/src/vision.ts:16-25`
    instructs the model never to identify the person, never to estimate body-fat
    percentage, and never to claim pathology from a still frame. No assertion
    enforces any of it. A prompt is a request; a validator is a guarantee.
13. **Live voice has no output gate at all.** Native audio goes browser↔provider.
    `roadmap.md` flags this explicitly: "Complete the deterministic safety gate
    before any live model can respond to a finalized voice turn. Text safety
    checks do not protect direct native-audio output." Today `/v1/coach/live-turns`
    (`coach.ts:850`) classifies the *user transcript* after the fact and stamps
    that category onto both messages — the assistant transcript is stored
    unexamined.
14. **There are no evals.** `ai/tests/*` (5 files) are unit tests over builders,
    schemas, and regexes; they never call a model. `backend/tests/live-*.e2e.ts`
    exercise HTTP lifecycles. There is no golden dataset, no scored regression
    suite, and therefore **no way to tell whether a prompt edit or a model bump
    made the product better or worse.** Given how much product behavior lives in
    prompt text — `coach.ts:21-37` and `:39-90` are together ~70 lines of
    behavioral contract, and `plan.ts:255-275` another ~21 — this is the largest
    quality risk in the repo.
15. **Prompts and configs are unversioned.** Prompts are string constants; a
    change ships silently with the deploy. `temperature: 0.3` is hardcoded for
    all three call types (`gemini.ts:51`). No prompt hash is stored with output,
    so a quality regression cannot be attributed to a specific prompt revision.

**Cost**

16. **Cost is entirely unmeasured.** No token counts, no price table, no
    per-user or per-feature attribution, no budget, no alert. Spend is knowable
    only from the provider's billing console, aggregated, after the fact.
17. **The cost profile is skewed and unguarded.** Plan generation requests up to
    **32,000 output tokens** (`plan.ts:285`) — roughly 9× the coach ceiling and
    35× vision — for a 12-week × 6-day program with per-exercise coaching notes.
    Rate limits are request-count only (`plans.ts:35` 3 per 10 min; `coach.ts:1015`
    20/min; camera `coach.ts:816` 6/min), which bounds *calls*, not *tokens*.
    Nothing stops an expensive-profile user from consuming a disproportionate
    share.
18. **No prompt caching.** The plan call re-sends the full instruction block plus
    the filtered exercise catalog (~56 planning entries after
    `availableExercises`, `exercise-catalog.ts:168`) on every generation. The
    coach call re-sends a ~4 KB system prompt every turn. Both are stable
    prefixes and are prime candidates for provider-side caching.
19. **Rate limiting is per-instance and in-memory** (`app.ts:24`). Correct for
    the single VM today; silently ineffective the moment the backend scales out.

---

## Part 2 — Target architecture

Five layers, each independently useful:

```
                    ┌─────────────────────────────────────────────┐
   browser ─────────│ Next proxy: request id, timing, error log    │
                    └───────────────────┬─────────────────────────┘
                                        │ x-request-id / traceparent
                    ┌───────────────────▼─────────────────────────┐
                    │ Fastify: structured logs, redaction, metrics │
                    └───────────────────┬─────────────────────────┘
                                        │
              ┌─────────────────────────▼──────────────────────────┐
              │ L1  aiCall boundary  (ai/src/instrumentation.ts)    │
              │     timeout · retry · usage · latency · cost · span │
              └─────────────────────────┬──────────────────────────┘
                                        │ emits one AiRunRecord
              ┌─────────────────────────▼──────────────────────────┐
              │ L2  validation ladder                              │
              │     schema → domain → policy → (repair) → judge     │
              └─────────────────────────┬──────────────────────────┘
                                        │
              ┌─────────────────────────▼──────────────────────────┐
              │ L3  aiRuns collection  (the evidence store)         │
              └───────┬───────────────────────────┬────────────────┘
                      │                           │
          ┌───────────▼──────────┐    ┌───────────▼─────────────┐
          │ L4 offline evals     │    │ L5 online analytics      │
          │  goldens · judge ·   │    │  SLOs · cost · model     │
          │  regression gate     │    │  comparison · budgets    │
          └──────────────────────┘    └──────────────────────────┘
```

The central design decision: **one `AiRunRecord` per model invocation**, written
for every call whether it succeeded, failed, was rejected by a validator, or fell
back. Offline evaluation, online quality monitoring, and cost attribution are all
then *queries over the same table* rather than three separate systems.

---

## Part 3 — The plan, stage by stage

Each stage lists why it comes when it does, what to build, which files change,
and how you know it is done. Stages 0–3 are prerequisites for everything else and
should not be reordered.

---

### Stage 0 — Make production logs exist and survive

**Why first:** every later stage produces signal that has to land somewhere
durable. Right now it would land in a 30 MB ring buffer that dies with the VM.
This stage is pure infrastructure and touches no product code.

**Build**

1. Install the Google Cloud Ops Agent in `infra/gcp/vm/startup.sh`, configured to
   tail the docker json-file logs for both containers and forward to Cloud
   Logging. Parse the JSON so pino fields become structured Cloud Logging fields
   (`severity`, `jsonPayload.*`) rather than an opaque text blob.
2. Map pino numeric levels to Cloud Logging `severity` (30→INFO, 40→WARNING,
   50→ERROR, 60→CRITICAL) in the agent's processor config.
3. Raise `--log-opt max-size` modestly (25m/3) as a local buffer against agent
   downtime.
4. Add a log-based metric and alert for `severity>=ERROR` rate, and one for the
   backend container restarting.
5. Document retention and cost expectations in `infra/gcp/vm/README.md`.

**Files:** `infra/gcp/vm/startup.sh`, `infra/gcp/vm/deploy-backend.sh`,
`infra/gcp/vm/README.md`, `infra/gcp/bootstrap.sh` (verify the VM service account
has `roles/logging.logWriter`, not just the deploy account).

**Done when:** a `request.log.warn` emitted on the VM is queryable in Cloud
Logging within a minute, with `jsonPayload.reqId` as a filterable field, and
survives a `deploy-backend.sh` run.

---

### Stage 1 — Structured logging and end-to-end correlation

**Why here:** correlation IDs must exist before traces, and log hygiene must
exist before we start logging anything derived from health data.

**Build**

1. **Configure the Fastify logger properly** (`backend/src/app.ts:17`):
   - `level` from a new `LOG_LEVEL` config key (default `info`, `debug` in dev).
   - `genReqId`: adopt an inbound `x-request-id` when present and well-formed,
     otherwise mint a UUID.
   - `redact`: `req.headers.authorization`, `req.headers.cookie`,
     `req.headers["xi-api-key"]`, `req.headers["x-simli-api-key"]`,
     `*.apiKey`, `*.dataBase64`, `*.imageBase64`, `*.token`, `*.signedUrl`.
   - Custom `req`/`res` serializers that log method, route (`request.routeOptions.url`,
     **not** the raw URL with its query string), status, and duration.
2. **A redaction helper in one place.** Add `backend/src/observability/redact.ts`
   with an allowlist-based `safeLogFields()`. The rule for this product is
   strict and non-negotiable: **coach message content, readiness notes,
   `movementNotes`, `bodyConsiderations`, attachments, camera frames, and email
   addresses never enter a log line.** Log lengths, hashes, counts, and
   categories instead. `docs/architecture.md:208` already states this
   requirement for Sentry; make it a shared primitive so it is applied
   consistently.
3. **Pseudonymous user id.** Log `userRef = sha256(userId + LOG_SALT)[0:16]`,
   never `userId` or email. It joins across records for debugging without making
   the log store a personal-data store.
4. **Propagate the id outward.** In `frontend/app/api/backend/[...path]/route.ts`:
   mint/forward `x-request-id`, forward it as a request header to the backend,
   echo it on the response, log method + upstream status + duration on every
   request, and log the caught error server-side instead of only returning it.
   Stop echoing `error.message` to the browser — return a generic message plus
   the request id, so a user can quote the id in a bug report.
5. **Log the events that matter** — a small, deliberate set, not blanket
   verbosity: auth failure, rate-limit rejection, plan generation start/finish
   with duration and outcome, plan validation failure with the validator's
   message, fallback engaged with reason, provider error with taxonomy, live
   session grant/denial, quota exhaustion.

**Files:** `backend/src/app.ts`, `backend/src/config.ts`,
`backend/src/observability/{logger,redact}.ts` (new),
`frontend/app/api/backend/[...path]/route.ts`.

**Done when:** a single user action can be reconstructed end to end by filtering
one `x-request-id`, and a reviewer can confirm by inspection that no log line
carries message text, health notes, or an email address.

---

### Stage 2 — The instrumented AI boundary

**Why here:** this is the keystone. Everything after Stage 2 — evals, judging,
model comparison, cost — reads the records this stage writes.

**Build**

1. **`ai/src/instrumentation.ts` — an `aiCall` wrapper** that every model call
   goes through. It owns:
   - **Timeout.** Per-task budget via `abortSignal` (coach 30s, plan 120s,
     vision 20s), configurable. Removes the current unbounded-request hazard.
   - **Retry.** Bounded exponential backoff with jitter for retryable classes
     only (429, 503, network/abort) — 2 retries for coach and vision; plan
     generation is expensive, so **1** retry, and the deterministic fallback
     absorbs the rest. Never retry a schema violation with identical inputs;
     that is Stage 4's repair loop.
   - **Usage capture.** Read `response.usageMetadata` and record
     `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`,
     `cachedContentTokenCount`, `totalTokenCount`.
   - **Timing.** Total wall clock, plus per-attempt durations.
   - **Error taxonomy.** Replace the collapsed `AiProviderError` with a
     discriminated reason: `auth | rate_limit | timeout | provider_unavailable |
     empty_response | malformed_json | schema_violation | policy_violation |
     unknown`. Keep the *user-facing* strings exactly as they are today — this is
     an internal taxonomy change, not a UX change.
   - **Failure sampling.** On `malformed_json` or `schema_violation`, capture a
     bounded, redacted excerpt of the raw output into the run record. Without
     this, prompt/schema bugs are undiagnosable.
2. **Reuse one `GoogleGenAI` client** per API key instead of constructing one per
   call (`gemini.ts:43`).
3. **Per-task generation config.** Lift `temperature` (`gemini.ts:51`) out of the
   shared function into a per-task `GenerationProfile` — coach, plan, and vision
   have genuinely different needs, and evals need to vary this knob.
4. **Version everything that affects output.** Introduce a `PromptSpec`:
   `{ id, version, hash, text }` where `hash = sha256(text)[0:12]`, computed at
   module load from the existing prompt constants. `promptId` and `promptHash`
   go into every run record. Add a test asserting that changing a prompt's text
   without bumping its `version` fails CI — this makes prompt changes
   deliberate and attributable.
5. **`AiRunRecord`** — the durable artifact, written to a new `aiRuns` collection:

   ```ts
   type AiRunRecord = {
     id: string;                    // uuid
     requestId: string;             // joins to logs
     traceId: string | null;        // joins to traces (Stage 3)
     userRef: string;               // pseudonymous, never raw userId
     feature: "coach" | "plan" | "vision" | "live_grant" | "judge";
     provider: "google" | "elevenlabs";
     model: string;
     promptId: string;
     promptVersion: number;
     promptHash: string;
     generationProfile: { temperature: number; maxOutputTokens: number };
     experimentKey: string | null;  // Stage 7
     startedAt: Date;
     durationMs: number;
     attempts: number;
     outcome: "ok" | "retried_ok" | "failed" | "fell_back";
     errorReason: string | null;
     usage: {
       promptTokens: number; outputTokens: number; thoughtTokens: number;
       cachedTokens: number; totalTokens: number;
     } | null;
     costMicroUsd: number | null;   // Stage 6
     validation: {                  // Stage 4
       schemaOk: boolean;
       domainOk: boolean | null;
       policyOk: boolean | null;
       failures: string[];          // validator identifiers only, never content
     };
     outputRef: { collection: string; id: string } | null;  // pointer, not content
     rawFailureExcerpt: string | null;  // only on parse/schema failure, bounded
     createdAt: Date;
   };
   ```

   **Content is referenced, never copied.** Coach replies already live in
   `coachMessages`, plans in `workoutPlans`. `aiRuns` stores the pointer. This
   keeps one deletion path for the account-deletion requirement in
   `roadmap.md`, and keeps the analytics store free of health text.
6. **TTL and indexes.** TTL on `createdAt` (90 days default, configurable);
   indexes on `{feature, startedAt}`, `{model, startedAt}`,
   `{userRef, startedAt}`, `{outcome, startedAt}`, `{experimentKey, startedAt}`.
7. **Write path.** `aiRuns` writes must never fail a user request: fire the
   insert after the response is composed, catch and log-only on failure.
8. **Wire the call sites.** `coach.ts:444`, `plans.ts:87`, `coach.ts:834`, and
   the two live-token grants (record the grant, its provider, and its outcome —
   the session itself is unobservable to us, but the grant is not).
9. **`/metrics` in Prometheus format**, bound to loopback and *not* exposed
   through Nginx: `ai_calls_total{feature,model,outcome}`,
   `ai_latency_seconds{feature,model}` (histogram),
   `ai_tokens_total{feature,model,kind}`, `ai_cost_microusd_total{feature,model}`,
   `ai_validation_failures_total{feature,validator}`,
   `plan_fallback_total{reason}`, plus HTTP RED metrics.

**Files:** `ai/src/instrumentation.ts`, `ai/src/prompts.ts`,
`ai/src/errors.ts` (new); `ai/src/gemini.ts`, `ai/src/{coach,plan,vision,live}.ts`;
`backend/src/domain/ai-runs.ts` (new); `backend/src/routes/{coach,plans}.ts`;
`backend/src/db.ts`; `backend/src/observability/metrics.ts` (new);
`backend/src/app.ts`.

**Note on layering:** `ai/` must stay free of MongoDB (`infra/README.md` is
explicit that AI-provider selection is isolated inside `ai/`). So `aiCall`
*returns* the telemetry alongside the result; the **backend** persists it. Pass a
`sink` callback if a cleaner seam is wanted.

**Done when:** every model call produces exactly one `aiRuns` document; a query
answers "p95 coach latency by model, last 24h", "schema-violation rate for plan
generation this week", and "tokens per feature per day"; and killing network
access to Gemini produces `errorReason: "provider_unavailable"` records, a clean
503 to the user, and a plan that still generates via fallback.

---

### Stage 3 — Distributed tracing

**Why here:** metrics tell you *that* p95 moved; traces tell you *where*. Once
`requestId` is threaded (Stage 1) and run records exist (Stage 2), tracing is
mostly a matter of adopting a standard.

**Build**

1. OpenTelemetry Node SDK in the backend, started before Fastify
   (`--import ./dist/tracing.js` in `backend/package.json` `start`), with
   auto-instrumentation for HTTP, Fastify, and MongoDB.
2. Manual spans at meaningful boundaries: `ai.call` (attributes:
   `ai.feature`, `ai.model`, `ai.prompt_hash`, `ai.tokens.*`, `ai.outcome`,
   following the OTel GenAI semantic-convention names where they exist),
   `ai.validate`, `plan.materialize`, `coach.context.load` (the coach handler
   fans out ~7 concurrent Mongo queries at `coach.ts:378-418` — worth seeing).
3. `traceparent` propagation from the Next proxy through to the backend, and
   `traceId` written into `AiRunRecord` and into every log line.
4. Exporter: OTLP to Google Cloud Trace initially (the VM already has a GCP
   identity, and this avoids a new vendor). Keep the exporter configurable so
   Sentry/Grafana/Honeycomb remain options.
5. Head sampling at ~10% for successful requests, **100% for any request whose
   AI call failed, fell back, or failed validation.**
6. Add Sentry (backend + frontend) for exceptions, wired to the same
   `requestId`/`traceId`, with the Stage 1 redaction applied to every payload.
   `docs/architecture.md:222` already nominates Sentry as the first integration.

**Files:** `backend/src/tracing.ts` (new), `backend/package.json`,
`backend/src/observability/*`, `frontend/app/api/backend/[...path]/route.ts`,
`frontend/instrumentation.ts` (new).

**Done when:** one trace shows proxy → Fastify → Mongo fan-out → Gemini call →
validation, with token counts on the AI span, and a validation failure is always
sampled.

---

### Stage 4 — The response validation ladder

**Why here:** this is where quality stops being aspirational. It needs Stage 2's
error taxonomy to distinguish "the provider failed" from "the model produced
something wrong".

Four rungs, applied in order, cheapest first. **Rungs 1–3 are deterministic and
run on 100% of traffic. Rung 4 (the judge) is a model call and never runs
synchronously in the user path.**

**Rung 1 — Schema (exists).** Zod + `responseJsonSchema`. Extend only to record
*which* field failed into `validation.failures`.

**Rung 2 — Domain (exists for plans, missing elsewhere).** `validatePlanDraft` is
the model to copy. Build the missing ones:

- **Coach reply validator** (`ai/src/validation/coach.ts`, new). Deterministic,
  content-based, each check individually testable:
  - `personalizationEvidence` must be non-empty and each item must be
    *substring-verifiable* against the supplied profile/training context — the
    prompt (`coach.ts:59`) demands "facts copied or faithfully paraphrased" and
    the evidence block is rendered to the user (`appendPersonalizationEvidence`,
    `:117`), so a fabricated fact is a visible correctness bug today.
  - No account identifiers in evidence (the prompt asks for this; enforce it).
  - **Exercise names mentioned in a reply that references the saved plan must
    exist in the catalog.** This is the coach-side analogue of the plan's
    catalog-membership check and directly targets "never invent exercises"
    (`coach.ts:62`).
  - Format contract: no Markdown tables, headings present for substantive
    replies, length within the stated 250–500-word band for review/plan/meal
    requests (`coach.ts:64`, `:67`).
  - Banned-opener check (`coach.ts:26` lists them explicitly).
  - Prohibited-content check: dehydration/diuretic/laxative/PED protocols
    appearing in *output* — currently only the *input* is screened
    (`safety.ts:12`).
  - Escalation consistency: if `safetyCategory !== "none"` then
    `shouldPauseWorkout` must agree with the category.
- **Vision output validator** (`ai/src/validation/vision.ts`, new). Enforce what
  `vision.ts:16-25` merely requests: reject an exact body-fat percentage, reject
  identity/demographic inference, require non-empty `limitations` when
  `status === "analyzed"`, require a concrete repositioning instruction when
  `status === "needs_better_view"`.
- **Live-turn validator.** Run `classifySafetyMessage` over the **assistant**
  transcript at `/v1/coach/live-turns` (`coach.ts:850`), not just the user's.
  Persist an output safety category, and when it trips, surface a client-side
  interrupt + fixed safety message. This is a direct answer to the
  `roadmap.md` launch blocker. It is after-the-fact for native audio — the honest
  mitigation — and the plan should say so plainly rather than imply a guarantee
  we cannot deliver for a browser↔provider audio stream.

**Rung 3 — Repair, then fall back.** On a Rung 1 or 2 failure:
1. **One** repair attempt: re-call with the validator's message appended as a
   correction instruction and a lower temperature. Record it as a distinct
   `attempts`/`outcome` value so repair rate is measurable.
2. If repair fails: plans → `buildDeterministicPlan` (existing behaviour,
   `plans.ts:122`); coach → a deterministic, non-model safe reply rather than a
   raw 503; vision → `needs_better_view`.
3. Every rung and every repair increments `ai_validation_failures_total` and
   lands in the run record.

**Rung 4 — LLM-as-judge (Stage 5).** Asynchronous, sampled, never blocking.

**Files:** `ai/src/validation/*.ts` (new), `ai/src/instrumentation.ts`,
`backend/src/routes/coach.ts`, `backend/src/domain/plans.ts` (unchanged logic,
now reporting structured failure ids).

**Done when:** the coach path has a deterministic output contract with unit
tests per check; the vision path enforces its own privacy prompt; the live path
screens assistant transcripts; and `validation.failures` distributions are
visible per model and per prompt version.

---

### Stage 5 — Offline evaluation harness

**Why here:** Stage 4 tells you if an output is *invalid*. Evals tell you if a
valid output is *good* — and this is the machinery that makes "which model
should we use" answerable.

**Build**

1. **`evals/` workspace** (a new npm workspace; keep it out of the deployed
   containers). Structure:
   ```
   evals/
     datasets/       coach.jsonl, plan.jsonl, vision.jsonl, safety.jsonl
     rubrics/        coach.md, plan.md, vision.md
     runners/        run-suite.ts, compare.ts
     scorers/        deterministic.ts, judge.ts
     reports/        (gitignored output)
   ```
2. **Golden datasets — the real work of this stage.** Build them from four
   sources, in this order of value:
   - **Curated fixtures** covering the profile matrix that actually drives
     behaviour: `{beginner, intermediate, advanced} × {cut, bulk, recomposition,
     maintenance} × {home, dumbbells-only, commercial gym} × {2,4,6 days} ×
     {30,60,90 min}`. The prompts encode heavy conditional logic on exactly these
     axes (`plan.ts:255-275`, `planVolumeTargetsFor`), so this is where
     regressions will hide.
   - **Adversarial and safety cases**, including everything in `safety.ts` plus
     near-misses that must *not* trip it ("my muscles are sore" ≠ "sharp pain"),
     PED and rapid-cut requests phrased indirectly, prompt injection inside
     `movementNotes` and coach attachments, and requests for medical diagnosis.
   - **Regression cases from production failures** — every distinct
     `validation.failures` signature and every `local-fallback:validation` from
     `aiRuns` becomes a permanent test case. This is why Stage 2 comes first.
   - **Real anonymized conversations only under an explicit consent flow.** Given
     the free-tier data terms flagged in `docs/architecture.md:186-191` and
     `roadmap.md`, treat this as gated on the privacy work, not a prerequisite.
     The synthetic matrix is sufficient to start.
3. **Deterministic scorers first** (cheap, stable, no model needed): all Rung 1–3
   validators, plus `planVolumeTargetsFor` adherence, catalog membership, week
   uniqueness, day-count and duration adherence, safety-gate precision/recall,
   format compliance, latency, token count, cost.
4. **A CLI:** `npm run eval -- --suite coach --model gemini-3.1-flash-lite --n 3`,
   writing a JSON report plus a Markdown summary. `--n` runs each case k times so
   **variance is reported, not hidden** — a single sample per case will make you
   chase noise.
5. **Comparison mode:** `npm run eval:compare -- --a <run> --b <run>` producing a
   per-metric diff with win/loss/tie counts and per-case drill-down.
6. **CI integration, in two tiers:**
   - *Every PR*: the deterministic, model-free suites (safety classifier,
     validators, schema) — fast and free. These can gate merges.
   - *Nightly and on prompt/model change*: the full model-calling suite against a
     dedicated eval API key with its own budget. Post the report to the PR.
     **Do not gate merges on a stochastic, paid suite**; gate on the
     deterministic tier and treat the model tier as review evidence.

**Files:** `evals/**` (new), root `package.json` workspaces, `turbo.json`,
`.github/workflows/evals.yml` (new).

**Done when:** `npm run eval -- --suite plan` scores a full matrix against the
live model and reports validity rate, volume-target adherence, fallback rate,
p50/p95 latency, mean tokens, and mean cost — and running it twice shows the
variance.

---

### Stage 6 — LLM-as-judge, done defensibly

**Why here:** a judge is only worth building once deterministic scoring is
exhausted, because a judge is itself a stochastic, costly, biased component that
needs its own validation. The temptation is to start here; resist it.

**Design principles**

- **The judge scores what code cannot.** Coaching quality, personalization
  depth, tone-contract adherence, non-sycophancy, actionability, honest handling
  of missing data. Anything checkable in code stays in code — it is cheaper and
  exact.
- **Rubric-anchored, not vibes.** Each dimension gets a 1–5 scale with a written
  anchor per point, in `evals/rubrics/*.md`, derived directly from the existing
  behavioral contract (`coach.ts:21-37`) so the judge and the product agree on
  what "good" means.
- **Structured output.** The judge returns `{ dimension, score, evidenceQuote,
  reasoning }[]` with a required verbatim quote from the response. Requiring
  evidence measurably reduces ungrounded scoring and makes disagreements
  auditable.
- **Pairwise beats absolute for model selection.** Absolute 1–5 scores drift
  between judge versions. For "is model B better than model A", use pairwise
  preference with **randomized position** (to counter position bias) and
  **anonymized model identity** — then report win-rate with confidence intervals.
- **A different model judges than the one generating.** Self-preference bias is
  real. Judge with a stronger model than the production one and hold the judge
  model + judge prompt fixed across a comparison; a judge change invalidates
  historical scores, so it gets its own version and its own `promptHash`.
- **The judge is itself evaluated.** Hand-label ~100 responses across the quality
  range. Measure judge–human agreement (Cohen's κ, and Spearman correlation for
  ordinal scores). **Ship the judge only if κ ≥ 0.6 on the dimensions you intend
  to act on**; below that, fix the rubric before trusting a single number. Re-run
  this calibration whenever the judge model or rubric changes.
- **Cost control.** Judge runs are `feature: "judge"` runs in `aiRuns` with their
  own budget line, so judging never quietly becomes the largest line item.

**Two deployment modes**

1. **Offline (build first).** Judge the eval suite in Stage 5. This is the
   primary use and carries no production risk.
2. **Online sampling (build second).** Judge ~1–2% of production responses
   asynchronously, after the response is delivered, gated on consent. Feeds a
   quality trend line and catches drift that fixed datasets cannot. **Never
   blocking, never in the request path, and skipped entirely for any thread
   whose user has not consented** to their content being processed for quality
   review.

**Files:** `ai/src/judge.ts`, `evals/scorers/judge.ts`,
`evals/rubrics/*.md`, `evals/calibration/` (new);
`backend/src/domain/ai-runs.ts` (judge scores attach to the run record).

**Done when:** the judge scores the coach suite reproducibly, its agreement with
human labels is measured and documented, and a deliberately degraded prompt
(e.g. sycophancy re-enabled) is detected as a score drop.

---

### Stage 7 — Model comparison and safe rollout

**Why here:** this is the payoff. With Stages 2, 5, and 6 in place, "should we
switch models" becomes a measurement, not an argument.

**Build**

1. **A provider adapter.** `generateGeminiStructured` already isolates Gemini;
   generalize it to a `ModelAdapter` interface (`generateStructured`,
   `toProviderSchema`, `translateError`, `priceFor`) with a Gemini
   implementation. `infra/README.md` already asserts that vendor choice is
   isolated to `ai/`; this makes that true for *multiple simultaneous* vendors,
   which is what a comparison needs. Note the real constraint: the Zod→JSON
   Schema stripping in `gemini.ts:5-12` (dropping `maxLength`, `pattern`,
   `minItems`, …) is Gemini-specific, and other providers support those keywords
   — so the adapter must own schema translation, and the *validators* must not
   assume the provider enforced any constraint.
2. **A model registry** — `ai/src/models.ts`: id, provider, input/output/cached
   price per million tokens, context window, max output, structured-output
   support, live/multimodal support, and a `status` of
   `candidate | production | deprecated`.
3. **Three comparison mechanisms, in increasing risk order:**
   - **Offline suite** (Stage 5/6) — first and cheapest. Most decisions end here.
   - **Shadow mode** — run the candidate on a sample of real production inputs
     *after* serving the production response, discard the candidate output,
     record its run. Gives real-input latency, cost, validity, and judge scores
     with **zero user exposure**. This is the highest-value, lowest-risk step and
     should be the default before any live traffic split.
   - **Online experiment** — deterministic assignment by
     `hash(userId + experimentKey)` so a user's experience stays consistent
     within an experiment, `experimentKey` on every run record, and a kill switch
     that reverts to the control model without a deploy.
4. **A decision scorecard** — no model changes without it:

   | Dimension | Source | Gate |
   | --- | --- | --- |
   | Schema/domain validity rate | Stage 4 | ≥ control |
   | Safety-suite pass rate | Stage 5 | 100%, no exceptions |
   | Judge quality (pairwise) | Stage 6 | win-rate ≥ 50% with CI excluding a loss |
   | p95 latency | Stage 2 | within budget per feature |
   | Cost per successful response | Stage 8 | reported; regression needs explicit sign-off |
   | Fallback rate | Stage 2 | ≤ control |

5. **Config, not code.** Model selection is already `GEMINI_MODEL` env
   (`config.ts:13`). Extend to per-feature overrides
   (`MODEL_COACH`, `MODEL_PLAN`, `MODEL_VISION`) so a single feature can be moved
   or rolled back independently and instantly.

**Files:** `ai/src/adapters/*.ts`, `ai/src/models.ts`,
`backend/src/domain/experiments.ts` (new); `backend/src/config.ts`;
`evals/runners/compare.ts`.

**Done when:** a candidate model can be scored offline, shadowed on real traffic
for a week, and promoted or rejected on documented evidence — with rollback
being an env change.

---

### Stage 8 — Cost engineering

**Why here:** the token data arrives in Stage 2; this stage turns it into money,
attribution, and control.

**Build**

1. **A pricing table in the model registry**, versioned with an effective date so
   historical costs are not silently rewritten when prices change. Compute
   `costMicroUsd` per run from `usage` × price, distinguishing cached input
   tokens (materially cheaper) and thinking tokens (billed as output).
2. **Attribution dimensions:** per feature, per model, per prompt version, per
   experiment, per `userRef`, per outcome. The critical derived metric is
   **cost per *successful, valid* response** — not cost per call. A model that
   is cheap per call but fails validation 15% of the time is not cheap, because
   every failure pays for a repair or a fallback.
3. **The specific cost levers this codebase has**, in order of expected value:
   - **The 32,000-token plan ceiling** (`plan.ts:285`) is the dominant line item.
     Measure actual output tokens per plan first; the ceiling is probably far
     above the p99. Then: shorten `coachingNotes` (already flagged in the prompt
     at `plan.ts:275`), or generate week 1 in detail and later weeks as deltas,
     or set the ceiling from `programDurationWeeks × trainingDaysPerWeek` rather
     than one flat maximum.
   - **Prompt caching** for the two stable prefixes: the ~4 KB coach system
     prompt re-sent every turn, and the plan instruction block + exercise catalog
     (~56 entries). Both are ideal cache candidates; measure
     `cachedContentTokenCount` to prove the hit rate.
   - **Coach history window.** `coach.ts:389` loads the last 12 messages
     unconditionally. Measure the input-token contribution and consider a
     token-budgeted window with summarization of older turns (the live path
     already does something like this — `compactDatedLiveHistory` with a 24,000
     budget, `coach.ts:727`).
   - **Per-feature model routing.** Vision (900 tokens, narrow task) and coach
     (conversational) have different quality/cost curves. Stage 7's per-feature
     model config makes routing a config change.
4. **Budgets and enforcement — the part that actually prevents a bad month:**
   - Per-user daily/monthly token budget, checked before expensive calls.
     Today's rate limits bound requests, not tokens; a token budget bounds spend.
     Return a clear, non-alarming message on exhaustion, matching the existing
     `retry-after` convention (`frontend/lib/api.ts:13`).
   - Global daily spend ceiling with tiered response: warn → degrade (cheaper
     model, deterministic planner) → shed non-essential features (vision, judge
     sampling) → alert. Degradation must be graceful; plan generation already has
     a validated non-model path.
   - **Feature kill switches** for voice, avatar, vision, plan generation, and
     judge sampling — runtime config, no deploy required. This is an explicit
     `roadmap.md:119` launch blocker and belongs here.
   - A Gemini quota/latency probe analogous to `elevenLabsQuotaAvailability`,
     surfaced in `/health/ready` as a degraded (not failed) signal.
5. **Reporting.** A weekly cost report from `aiRuns`: spend by feature/model/day,
   cost per active user, cost per successful plan, cost per coach turn, wasted
   spend (failed + repaired + fallback calls), and top cost drivers. This is what
   makes "is this product economically viable per user" answerable.

**Files:** `ai/src/models.ts`, `backend/src/domain/{ai-runs,budgets}.ts`,
`backend/src/domain/feature-flags.ts` (new), `backend/src/routes/*`,
`scripts/cost-report.mjs` (new).

**Done when:** a dashboard shows cost per feature per day and cost per successful
response by model; a per-user budget demonstrably stops runaway usage; and each
kill switch can be flipped without a deploy.

---

### Stage 9 — Production operations

**Why last:** SLOs are only meaningful once the underlying signals are real.

**Build**

1. **SLOs**, defined against measured baselines rather than invented numbers:
   availability of coach and plan endpoints; p95 latency per feature; AI success
   rate (delivered a valid response, fallback included); validation pass rate;
   safety-gate correctness (this one is a hard 100% target, alerted individually).
2. **Alerts that page vs. alerts that ticket.** Page: coach/plan error rate
   breach, safety-gate failure, provider auth failure, spend ceiling breach,
   backend down. Ticket: fallback-rate drift, judge-score drift, cost-per-response
   drift, quota approaching.
3. **Dashboards** — three, not thirty: *Service health* (RED metrics, Mongo,
   deploys), *AI quality* (validity, fallback, validation failures by type, judge
   trend, per model and per prompt version), *AI cost* (spend by feature/model/day,
   cost per successful response, budget consumption, cache hit rate).
4. **Runbooks** in `docs/runbooks/`: provider outage, quota exhaustion, model
   regression detected, cost spike, safety-gate failure, log pipeline down. Each
   names the kill switch and the rollback.
5. **Load testing** the paths `roadmap.md` calls out: uncached landing route, the
   authenticated proxy, the Mongo pool, synchronous plan generation, and voice
   provisioning — with the AI provider stubbed, so the test measures *our*
   capacity rather than Google's.
6. **Deletion and export must cover `aiRuns`.** The account-deletion requirement
   in `roadmap.md` gets a new collection here; wire it in the same change that
   creates the collection, not later.

**Files:** `docs/runbooks/*` (new), `infra/gcp/` alert policies,
`.github/workflows/` (nightly eval + cost report).

---

## Part 4 — Sequencing and dependencies

```
Stage 0  logs survive            ──┐
Stage 1  structured + correlated ──┼──> Stage 2  aiCall + aiRuns  ──┬──> Stage 3 tracing
                                   │                               │
                                   └───────────────────────────────┼──> Stage 4 validation ladder
                                                                   │        │
                                                                   │        ▼
                                                                   │   Stage 5 eval harness
                                                                   │        │
                                                                   │        ▼
                                                                   │   Stage 6 LLM judge
                                                                   │        │
                                                                   │        ▼
                                                                   ├──> Stage 7 model comparison
                                                                   └──> Stage 8 cost ──> Stage 9 ops
```

Hard dependencies: 2 requires 1; 5 requires 4 (validators are the scorers) and 2
(production failures become test cases); 6 requires 5; 7 requires 5, 6, 8; 8
requires 2.

Suggested grouping if the work is delivered incrementally:

- **First increment — "we can see production."** Stages 0, 1, 2.
  Highest value per unit of effort by a wide margin, and it unblocks everything.
  If only one increment is ever built, build this one.
- **Second increment — "bad output cannot reach users silently."** Stages 3, 4.
  Closes the live-voice and vision gates that `roadmap.md` lists as launch
  blockers.
- **Third increment — "we can judge models."** Stages 5, 6.
- **Fourth increment — "we can choose models and afford them."** Stages 7, 8, 9.

---

## Part 5 — Decisions to make before starting

These change the shape of the work and are worth settling explicitly.

1. **Where does telemetry live?** Recommendation: Cloud Logging + Cloud Trace +
   Sentry, with `aiRuns` in the existing MongoDB. Rationale: the VM already has a
   GCP identity, `docs/architecture.md:222` nominates Sentry first, and a
   dedicated LLM-observability SaaS is a data-residency decision that should not
   be made casually while health data is in scope. Keep the OTLP exporter
   configurable so that stays reversible.
2. **Does `aiRuns` store content?** Recommendation: **no** — pointers only, for
   the deletion-path and privacy reasons above. Failure excerpts are the sole
   exception, bounded and redacted.
3. **Judge model.** A model stronger than the production one, held fixed across
   any comparison, versioned like a prompt.
4. **Consent for online judging.** Offline eval on synthetic data needs no
   consent. Judging real member conversations does. Recommendation: build offline
   judging first and gate online sampling on the privacy work already required by
   `roadmap.md`.
5. **Eval budget.** A dedicated API key with its own quota so eval spend is
   isolated from production spend and can never exhaust the production quota.

---

## Part 6 — Risks

- **Instrumentation that leaks health data.** The single largest risk in this
  plan. Mitigation: allowlist-based redaction built in Stage 1 *before* any AI
  telemetry exists in Stage 2, plus a review checklist item and a test asserting
  no known-sensitive field name appears in serialized log output.
- **Judge scores treated as ground truth.** Mitigation: the κ ≥ 0.6 calibration
  gate, mandatory evidence quotes, pairwise-with-CI for decisions, and never
  gating a merge on a judge score alone.
- **Eval overfitting.** Datasets built only from past failures drift toward
  passing yesterday's bugs. Mitigation: keep the profile-matrix suite as a
  stable core, add regression cases alongside it rather than in place of it, and
  hold out a slice never used for prompt iteration.
- **Observability cost exceeding AI cost.** Real at low traffic. Mitigation:
  sampled tracing, `aiRuns` TTL, judge sampling at 1–2%, and the cost report
  including the telemetry line itself.
- **Latency added to the user path.** Mitigation: run-record writes are
  fire-and-forget, judging is fully asynchronous, validators are cheap and
  deterministic, and Stage 2's timeouts *reduce* worst-case latency relative to
  today's unbounded call.
- **Stage 2 changes the shared AI path.** Mitigation: keep user-facing error
  strings byte-identical, land the wrapper behind the existing tests first, and
  verify `ai/tests/gemini.test.ts` error-translation expectations still hold.
