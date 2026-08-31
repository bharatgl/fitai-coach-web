# forgefit.space

forgefit.space is a monorepo with separately deployable frontend and backend apps,
a shared AI package, and shared API contracts. User-facing data comes from
authenticated MongoDB records; the app does not fall back to demo users,
workouts, or coach messages.

## Repository layout

```text
frontend/             Next.js UI, Auth.js, and authenticated backend proxy
backend/              Fastify Node API, MongoDB application data, authorization
ai/                   Gemini integration, prompts, structured output, safety rules
packages/contracts/   Types shared by frontend and backend
infra/                Portable runtime contract and cloud deployment adapters
docs/                 Architecture and delivery roadmap
```

The authenticated `/studio` workspace provides the reusable Forge Studio bot
builder for personal fitness, interview, resume, and custom specialists. Its
scope and clean-room product boundary are documented in
[`docs/forge-studio.md`](docs/forge-studio.md).

The `ai/` directory is an internal package, not a third public service. The
backend build bundles it into the backend container, keeping one secure
server-side Gemini integration without an extra network hop. Turborepo runs and
caches dependency-aware tasks across all workspaces.

## Requirements

- Node.js `>=22.13.0`
- A MongoDB Atlas deployment
- Google OAuth credentials
- A Gemini API key from Google AI Studio for Gemini Live voice and general generation
- Vertex AI application-default credentials for production Google Search grounding

## Local setup

```bash
npm install
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
npm run dev
```

Use the same strong `API_JWT_SECRET` value in both environment files. It is
server-only and is never exposed to the browser. The
frontend runs on `http://localhost:3000`; the backend runs on
`http://localhost:4000`.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

With the local backend running and an isolated Atlas test database configured,
the real workout lifecycle can also be verified through HTTP:

```bash
npm run test:e2e:workout --workspace backend
```

See [`docs/architecture.md`](docs/architecture.md) for request flows, security
boundaries, deployment setup, and recommended integrations. Delivery status is
tracked in [`docs/roadmap.md`](docs/roadmap.md). The repeatable GCP deployment
workflow is in [`infra/gcp/README.md`](infra/gcp/README.md).
The provider-neutral container contract is documented in
[`infra/README.md`](infra/README.md).
