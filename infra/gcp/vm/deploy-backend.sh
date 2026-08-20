#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
ZONE="${FITAI_GCP_ZONE:-asia-south1-a}"
VM_NAME="${FITAI_VM_NAME:-fitai-backend-vm}"
REPOSITORY="${FITAI_GCP_REPOSITORY:-fitai}"
IMAGE_TAG="${FITAI_IMAGE_TAG:-$(tr -d '\n' < infra/gcp/image-tag)}"
REGISTRY="${REGION}-docker.pkg.dev"
BACKEND_IMAGE="${REGISTRY}/${PROJECT_ID}/${REPOSITORY}/fitai-backend:${IMAGE_TAG}"

gcloud compute ssh "${VM_NAME}" \
  --zone="${ZONE}" \
  --tunnel-through-iap \
  --project="${PROJECT_ID}" \
  --command='until sudo test -f /var/lib/fitai-bootstrap-complete; do echo "Waiting for VM bootstrap..."; sleep 10; done'

gcloud compute scp \
  infra/gcp/vm/nginx-fitai-backend.conf \
  infra/gcp/vm/refresh-backend-secrets.sh \
  "${VM_NAME}:~/" \
  --zone="${ZONE}" \
  --tunnel-through-iap \
  --project="${PROJECT_ID}"

gcloud compute ssh "${VM_NAME}" \
  --zone="${ZONE}" \
  --tunnel-through-iap \
  --project="${PROJECT_ID}" \
  --command="set -euo pipefail
    sudo install -m 0755 ~/refresh-backend-secrets.sh /usr/local/sbin/fitai-refresh-backend-secrets
    sudo install -m 0644 ~/nginx-fitai-backend.conf /etc/nginx/conf.d/fitai-backend.conf
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo /usr/local/sbin/fitai-refresh-backend-secrets
    gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin https://${REGISTRY}
    sudo docker pull ${BACKEND_IMAGE}
    sudo docker rm -f fitai-backend >/dev/null 2>&1 || true
    sudo docker run -d \\
      --name fitai-backend \\
      --restart unless-stopped \\
      --env-file /etc/fitai/backend.env \\
      --publish 127.0.0.1:4000:8080 \\
      --read-only \\
      --tmpfs /tmp:rw,noexec,nosuid,size=64m \\
      --security-opt no-new-privileges \\
      --memory 768m \\
      --cpus 1.5 \\
      --log-opt max-size=10m \\
      --log-opt max-file=3 \\
      ${BACKEND_IMAGE}
    sudo nginx -t
    sudo systemctl reload nginx
    for attempt in {1..30}; do
      if curl --fail --silent http://127.0.0.1:4000/health/ready >/dev/null; then exit 0; fi
      sleep 2
    done
    sudo docker logs --tail=100 fitai-backend
    exit 1"

STATIC_IP="$(gcloud compute instances describe "${VM_NAME}" \
  --zone="${ZONE}" --project="${PROJECT_ID}" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
curl --fail --silent --show-error "http://${STATIC_IP}/health/live" >/dev/null
echo "Backend is healthy over HTTP at http://${STATIC_IP}"
echo "Point your domain to ${STATIC_IP}, then run npm run gcp:vm:https."
