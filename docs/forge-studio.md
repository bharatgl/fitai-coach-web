# Forge Studio

Forge Studio is the bot-builder foundation for focused personal specialists
under forgefit.space. The first product set is intentionally narrow:

- ForgeFit Coach for personal fitness and training
- Interview Coach for role-specific practice and feedback
- Resume Reviewer for truthful, target-role resume improvement
- Custom Specialist for new personal productivity use cases

Each bot owns its identity, specialty, first message, behavior, explicit
boundaries, personal context, reference material, starter prompts, voice choice,
and turn-taking style. Editing an
active bot creates a new draft. Activation provisions or updates a private
ElevenLabs agent; the browser receives only a short-lived signed session URL.
When ElevenLabs is unavailable, the preview switches to a short-lived Gemini
Live session using the same compiled bot identity and boundaries. Voice
recording is disabled and the generated agent configuration enables focus and
prompt-injection guardrails.

## Specialist workspace

Every active bot has a private runtime at `/studio/bots/:botId`. Studio remains
the configuration surface; the specialist workspace is the daily-use surface.
It generalizes ForgeFit's fitness conversation pattern with bot-driven identity,
starter prompts, persistent text history, structured replies, and the shared
live-voice panel.

Current-market research uses Google Search grounding through Vertex AI with the
backend workload identity. It does not expose a Cloud credential to the browser.
Production usage is protected by an atomic, server-side UTC daily request cap;
the bot fails closed instead of presenting model memory as current evidence when
the cap or provider quota is unavailable.

Text messages are stored in the user- and bot-scoped `botMessages` collection.
Response history is bounded before model calls, and every route verifies bot
ownership. Fitness-only workout tools and safety flows remain isolated in the
fitness product rather than leaking into unrelated specialists.

## Clean-room product boundary

Forge Studio is an original personal-specialist product built only from this
repository and public provider capabilities. It must not use or imitate
proprietary source code, designs, prompts, terminology, data models, workflows,
or internal knowledge from KaptureCX or Vitos.

The current product deliberately excludes:

- contact-center and customer-support operations
- ticketing, queue, SLA, CRM, or workforce workflows
- enterprise conversation monitoring or agent-performance analytics
- replicas of any employer or third-party proprietary product behavior

If a future proposal approaches one of these areas, it requires an independent
product review and a clean public-source specification before implementation.

## Current API

All bot routes are authenticated and user-scoped:

- `GET /v1/bots/templates`
- `GET /v1/bots`
- `POST /v1/bots`
- `GET /v1/bots/:botId`
- `PATCH /v1/bots/:botId`
- `POST /v1/bots/:botId/activate`
- `POST /v1/bots/:botId/session`
- `POST /v1/bots/:botId/live-token`
- `GET /v1/bots/:botId/messages`
- `POST /v1/bots/:botId/messages`

Document-review and knowledge-base switches are stored as forward-compatible
capabilities, but the Studio UI labels them as upcoming until bot-scoped upload,
retrieval, and authorization paths are implemented. The agent prompt never
claims those tools are available before they are actually attached.

## Next safe increments

1. Add bot-scoped resume and job-description uploads with retention controls.
2. Add version history and rollback for bot configurations.
3. Add evaluation cases for scope, hallucination, privacy, and prompt injection.
4. Add a specialist launcher that routes by explicit user choice, not hidden
   intent classification.
