# FitAI Coach

FitAI Coach is a monorepo with separately deployable frontend and backend apps,
a shared AI package, and shared API contracts. User-facing data comes from
authenticated MongoDB records; the app does not fall back to demo users,
workouts, or coach messages.

## Repository layout

```text
frontend/             Next.js UI, Auth.js, and authenticated backend proxy
backend/              Fastify Node API, MongoDB application data, authorization
ai/                   OpenAI integration, prompts, structured output, safety rules
packages/contracts/   Types shared by frontend and backend
docs/                 Architecture and delivery roadmap
```

The `ai/` directory is an internal package, not a third public service. Vercel
bundles it with the backend, keeping one secure server-side OpenAI integration
without an extra network hop.

## Requirements

- Node.js `>=22.13.0`
- A MongoDB Atlas deployment
- Google OAuth credentials
- An OpenAI API key

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

See [`docs/architecture.md`](docs/architecture.md) for request flows, security
boundaries, deployment setup, and recommended integrations. Delivery status is
tracked in [`docs/roadmap.md`](docs/roadmap.md).
