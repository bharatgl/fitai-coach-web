# GCP deployment

The production topology uses two public Cloud Run services, two dedicated
runtime service accounts, a least-privilege build account, Secret Manager,
Cloud Build, and Artifact Registry. The
backend's application endpoints still require the short-lived JWT issued by
the frontend proxy; only health checks are intentionally unauthenticated.

Defaults:

- Project: supplied through `FITAI_GCP_PROJECT_ID`
- Region: `asia-south1`
- Artifact Registry repository: `fitai`
- Cloud Run services: `fitai-frontend` and `fitai-backend`
- Scale-to-zero with a maximum of three instances per service

## First deployment

Install and authenticate the Google Cloud CLI, then run these commands from the
repository root:

```bash
export FITAI_GCP_PROJECT_ID="your-project-id"
export FITAI_GCP_REGION="asia-south1"

gcloud auth login
gcloud config set project "$FITAI_GCP_PROJECT_ID"

./infra/gcp/bootstrap.sh
npm run gcp:init-app-secrets
node ./infra/gcp/sync-secrets.mjs
./infra/gcp/deploy.sh
```

`initialize-app-secrets.mjs` generates independent production-only Auth.js and
API JWT secrets directly into Secret Manager and never prints them. It is
idempotent and will not replace an enabled version.

`sync-secrets.mjs` reads only the external-service credentials from the ignored
`frontend/.env.local` and `backend/.env` files and streams them directly to
Secret Manager. It never prints secret values. Rotate any MongoDB, Google OAuth,
or Gemini credential that has appeared in chat, a screenshot, or Git history
before running it.

After deployment, add the printed frontend callback URL to the Google OAuth web
client:

```text
https://<fitai-frontend-url>/api/auth/callback/google
```

For a custom domain, map the frontend service to the domain, add the equivalent
HTTPS callback URI in Google Cloud OAuth settings, and redeploy with
`AUTH_URL=https://your-domain` if Auth.js cannot infer the canonical host.
