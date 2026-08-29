# ADR 0002: AI plan changes use validated, confirmed proposals

- Status: accepted
- Date: 2026-08-28
- Owners: ForgeFit engineering

## Context

Members describe completed training, schedule changes, recovery, and exercise
preferences in natural language. A model can interpret that input, but model
output is nondeterministic and may omit confirmation, reference stale workouts,
or describe a change that was never persisted.

Prompt rules and regular expressions improve conversation quality but are not a
safe authorization or mutation boundary. UI effects that repair dates by
writing automatically also make page views surprising and vulnerable to races
between tabs.

## Decision

An AI model may create only a `PlanAdjustmentProposalDraft`. The draft uses
exact IDs and a constrained action vocabulary. Deterministic domain code turns a
valid draft into a persisted pending proposal containing:

- Member and active-plan ownership.
- Base plan revision.
- Exact before/after diff.
- Human-readable rationale.
- Creation and expiry times.
- Validation result and allowed confirmation action.

The member must explicitly confirm a pending proposal. The confirmation command
is authenticated, idempotent, and version checked. One transaction applies the
change, increments the plan revision, closes the proposal, and records an
immutable audit/outbox event.

The model and frontend cannot bypass domain validation or write plan documents
directly. A page view never mutates a plan.

## Consequences

Positive:

- The member always knows whether a recommendation changed saved state.
- Concurrent or stale proposals fail safely.
- Every applied change is attributable and auditable.
- The same workflow supports dates, order, volume, and exercise changes.

Negative:

- Adjustments require an additional confirmation interaction.
- Proposal schemas and migrations must evolve with plan capabilities.
- Some conversational suggestions will remain advisory when they cannot be
  represented safely by the constrained action vocabulary.

## Validation

- Replaying confirmation cannot apply a proposal twice.
- A proposal created from revision N cannot overwrite revision N+1.
- Unknown, cross-user, completed, or otherwise invalid workout IDs are rejected.
- Provider failure leaves the current plan unchanged.
- Conversation text never claims a saved change before the transaction succeeds.
