# Ubuntu VM application stack

This adapter hosts the Next.js frontend and Fastify backend as separate Docker
containers on Compute Engine. Nginx serves the frontend at the root host and the
backend at the API host. The frontend calls the backend over a private Docker
network, so the internal bearer token and backend origin never enter the browser.

## Topology

```text
Internet -> static IPv4 -> Nginx :80/:443 -> frontend 127.0.0.1:3000
                                           -> backend 127.0.0.1:4000
frontend container -> private Docker DNS -> backend container :8080
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

Point the frontend apex, `www`, and API hostname to the printed static IP. After
DNS propagation:

```bash
export FITAI_FRONTEND_DOMAIN="example.com"
export FITAI_API_DOMAIN="api.example.com"
export FITAI_CERTBOT_EMAIL="you@example.com"
npm run gcp:vm:https
```

The default production domains are `forgefit.space`, `www.forgefit.space`, and
`api.forgefit.space`.

SSH uses IAP instead of exposing port 22 to the internet:

```bash
gcloud compute ssh fitai-backend-vm \
  --zone=asia-south1-a \
  --tunnel-through-iap \
  --project="$FITAI_GCP_PROJECT_ID"
```

The host installs Docker, Node.js 22, Nginx, the Google Cloud CLI, Certbot, and
automatic security updates. Both applications run inside versioned Docker
images; the host Node.js installation is available for administration only.
