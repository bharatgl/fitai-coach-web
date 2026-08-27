# Exercise library

ForgeFit bundles 1,324 exercise records sourced from the MIT-licensed
[Exercises Dataset](https://github.com/hasaneyldrm/exercises-dataset) used by
OpenGym. The snapshot contains names, body parts, equipment, target and
supporting muscles, and English instruction steps.

The source images and GIFs are owned by Gym Visual and are not included. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for attribution and the
license notice.

The public and signed-in browser merges that complete reference library with
the 250-exercise RepDB free-tier snapshot. Exact normalized names are combined,
and duplicate names are consolidated, producing 1,521 unique searchable
movements. All movements include instructions; the 250 RepDB movements include
459 referenced 512px WebP illustrations. The browser can be filtered by body
part, equipment, search term, or illustration availability.

RepDB assets are licensed for commercial in-app use with visible attribution.
ForgeFit does not expose RepDB records through its exercise API, redistribute
them as a standalone dataset, include paid-tier preview animations, or use the
illustrations as generative-AI references. Similar-looking movements are not
matched heuristically, preventing an exercise from showing instructions or an
illustration for a different equipment variant.

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

## Refreshing RepDB visuals

After reviewing the current RepDB license, run:

```sh
npm run exercises:import:repdb -- \
  --source /absolute/path/to/RepDB/exercise-dataset \
  --source-commit <reviewed-commit-sha>
```

The importer accepts only the 250-entry free tier, copies only flat WebP images
referenced by those records, excludes premium preview animations, and preserves
the RepDB license and attribution files alongside the in-app assets.
