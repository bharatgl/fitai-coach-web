# ADR 0001: Keep the core API modular and extract workers by workload

- Status: accepted
- Date: 2026-08-28
- Owners: ForgeFit engineering

## Context

ForgeFit currently deploys a Next.js frontend and a Fastify backend. Training
plans, workout execution, readiness, progress, and coaching context share
transactional user-owned data in MongoDB. AI generation and provider traffic
have different latency, quota, retry, and scaling characteristics from ordinary
training reads and writes.

Splitting each product domain into a network service now would add distributed
transactions, versioned inter-service contracts, additional failure modes, and
operational load without solving the immediate bottlenecks. Keeping synchronous
AI work inside the API, however, allows provider latency and saturation to
consume capacity required for core training workflows.

## Decision

Keep one modular Fastify API for identity mapping, profiles, programs, workout
execution, coaching records, and progress commands. Enforce module ownership in
code and persistence even though these modules share one deployable.

Create a separately deployable worker process for retryable, long-running, or
provider-bound workloads. The API and workers communicate through a durable
task adapter and persisted job state. Core API requests never invoke a worker
through a synchronous service-to-service call.

Frontend, API, and workers scale independently. No domain becomes a separate
network service until measured scaling, availability, ownership, or release
requirements justify the additional boundary.

## Consequences

Positive:

- Workout logging retains one local transaction boundary.
- Provider saturation cannot consume all core API instances.
- AI jobs gain durable retry and admission control.
- The repository avoids premature service proliferation.

Negative:

- Module boundaries require review and tests because the compiler cannot fully
  prevent cross-module database access.
- The API remains a shared deployment and therefore retains some release blast
  radius.
- Job schemas and idempotent handlers become required infrastructure.

## Validation

- A forced AI-provider outage does not affect profile, plan read, or workout
  execution SLOs.
- Worker concurrency can be changed without redeploying the API.
- No worker task is required to complete an open user database transaction.
