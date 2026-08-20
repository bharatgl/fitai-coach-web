#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
DOMAIN="${FITAI_DOMAIN:?Set FITAI_DOMAIN, for example api.example.com}"
EMAIL="${FITAI_CERTBOT_EMAIL:?Set FITAI_CERTBOT_EMAIL for certificate notices}"
ZONE="${FITAI_GCP_ZONE:-asia-south1-a}"
VM_NAME="${FITAI_VM_NAME:-fitai-backend-vm}"

if [[ ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${DOMAIN}" != *.* ]]; then
  echo "FITAI_DOMAIN is not a valid hostname." >&2
  exit 1
fi
if [[ ! "${EMAIL}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "FITAI_CERTBOT_EMAIL is not a valid email address." >&2
  exit 1
fi

STATIC_IP="$(gcloud compute instances describe "${VM_NAME}" \
  --zone="${ZONE}" --project="${PROJECT_ID}" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"

gcloud compute ssh "${VM_NAME}" \
  --zone="${ZONE}" \
  --tunnel-through-iap \
  --project="${PROJECT_ID}" \
  --command="set -euo pipefail
    resolved_ip=\"\$(getent ahostsv4 '${DOMAIN}' | awk 'NR == 1 { print \$1 }')\"
    if [[ \"\${resolved_ip}\" != '${STATIC_IP}' ]]; then
      echo 'DNS is not ready: ${DOMAIN} must resolve to ${STATIC_IP}.' >&2
      exit 1
    fi
    sudo sed -i 's/server_name _;/server_name ${DOMAIN};/' /etc/nginx/conf.d/fitai-backend.conf
    sudo nginx -t
    sudo systemctl reload nginx
    sudo certbot --nginx --non-interactive --agree-tos --redirect --email '${EMAIL}' -d '${DOMAIN}'
    sudo certbot renew --dry-run"

curl --fail --silent --show-error "https://${DOMAIN}/health/ready" >/dev/null
echo "Backend HTTPS is ready at https://${DOMAIN}"
