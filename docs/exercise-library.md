# Exercise library

ForgeFit bundles 1,324 exercise records sourced from the MIT-licensed
[Exercises Dataset](https://github.com/hasaneyldrm/exercises-dataset) used by
OpenGym. The snapshot contains names, body parts, equipment, target and
supporting muscles, and English instruction steps.

The source images and GIFs are owned by Gym Visual and are not included. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for attribution and the
license notice.

## API

- `GET /v1/exercises` accepts `query`, `bodyPart`, `equipment`, `target`,
  `offset`, and `limit` (maximum 100).
- `GET /v1/exercises/:id` returns one exercise and source provenance.

The routes are public so the product can expose an exercise browser before
sign-in. Global backend rate limiting still applies.

## Refreshing the pinned snapshot

Clone the upstream repository, inspect its current license and notice, and then
run:

```sh
npm run exercises:import --workspace backend -- \
  --source /absolute/path/to/exercises-dataset/data/exercises.json \
  --source-commit <reviewed-commit-sha>
```

The importer rejects any source count other than 1,324, requires stable unique
IDs and English instructions, and writes only the approved non-media fields to
`backend/src/data/exercises.json`.

The imported library is reference data, not the AI planning allowlist. Promote
movements into `backend/src/domain/exercise-catalog.ts` only after reviewing
their safety guidance, experience level, equipment compatibility, and demo
rights.
