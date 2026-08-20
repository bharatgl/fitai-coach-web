# Ubuntu VM backend

This adapter hosts only the Fastify backend on Compute Engine. The Next.js
frontend remains on Cloud Run and calls the backend through its HTTPS domain.

## Topology

```text
Internet -> static IPv4 -> Nginx :80/:443 -> Docker 127.0.0.1:4000 -> Node :8080
Administrator -> Google IAP -> SSH :22
VM service identity -> Secret Manager + Artifact Registry
```

The default is an Ubuntu 24.04 `e2-small` VM in `asia-south1-a` with a 20 GB
balanced disk. Override `FITAI_VM_MACHINE_TYPE` if a different size is needed.
Only ports 80/443 are public; SSH accepts traffic only from Google's IAP range.

## Order of operations

```bash
export FITAI_GCP_PROJECT_ID="your-project-id"
export FITAI_GCP_REGION="asia-south1"
export FITAI_GCP_ZONE="asia-south1-a"

npm run gcp:vm:provision
# Copy the printed static IP into MongoDB Atlas Network Access as <IP>/32.
npm run gcp:vm:deploy
```

Create an `A` record such as `api.example.com` pointing to the printed static
IP. After DNS propagation:

```bash
export FITAI_DOMAIN="api.example.com"
export FITAI_CERTBOT_EMAIL="you@example.com"
npm run gcp:vm:https
```

Deploy the frontend only after backend HTTPS succeeds:

```bash
export FITAI_BACKEND_URL="https://api.example.com"
npm run gcp:frontend:deploy
```

SSH uses IAP instead of exposing port 22 to the internet:

```bash
gcloud compute ssh fitai-backend-vm \
  --zone=asia-south1-a \
  --tunnel-through-iap \
  --project="$FITAI_GCP_PROJECT_ID"
```

The host installs Docker, Node.js 22, Nginx, the Google Cloud CLI, Certbot, and
automatic security updates. The backend still runs inside the versioned Docker
image; the host Node.js installation is available for administration only.
