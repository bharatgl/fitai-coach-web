# Portable runtime contract

GCP is the current deployment adapter, not a dependency of the application.
Both applications are standard Linux/ARM64/AMD64 OCI containers and communicate
over HTTPS using environment-based configuration. MongoDB Atlas remains outside
the compute provider, so moving the containers does not require a data migration.

## Service contract

| Container | Port | Health endpoint | Configuration |
| --- | --- | --- | --- |
| `frontend/Dockerfile` | platform-provided `PORT` | `/signin` | Auth.js, MongoDB, shared JWT secret, backend HTTPS URL |
| `backend/Dockerfile` | platform-provided `PORT` | `/health/live`, `/health/ready` | MongoDB, shared JWT secret, Gemini key/model |

The application code imports no GCP SDK and contains no GCP resource names.
Provider-specific secret names, IAM, image registries, scaling, and deployment
commands live only under `infra/gcp/`. GCP currently has two interchangeable
backend adapters: Cloud Run and an Ubuntu Compute Engine VM behind Nginx.

## Switching providers

To move to another container service:

1. Push the two OCI images to that provider's registry.
2. Create two services from the images and expose the platform `PORT`.
3. Map the variables listed in `frontend/.env.example` and
   `backend/.env.example` from the provider's secret store.
4. Point frontend `BACKEND_API_URL` at the backend HTTPS URL.
5. Add the new frontend `/api/auth/callback/google` URL to the Google OAuth
   client.
6. Verify backend readiness, sign-in, and an authenticated proxied API call.

No source-code changes should be required. `compose.yaml` exercises the same
contract locally and is also a useful starting point for platforms that accept
Docker Compose or Kubernetes conversion tools.

AI-provider selection is isolated inside `ai/`; changing the model vendor is a
separate adapter change and does not affect either container boundary.
