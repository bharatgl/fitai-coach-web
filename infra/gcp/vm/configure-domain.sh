#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
FRONTEND_DOMAIN="${FITAI_FRONTEND_DOMAIN:-forgefit.space}"
API_DOMAIN="${FITAI_API_DOMAIN:-${FITAI_DOMAIN:-api.${FRONTEND_DOMAIN}}}"
WWW_DOMAIN="${FITAI_WWW_DOMAIN:-www.${FRONTEND_DOMAIN}}"
EMAIL="${FITAI_CERTBOT_EMAIL:?Set FITAI_CERTBOT_EMAIL for certificate notices}"
ZONE="${FITAI_GCP_ZONE:-asia-south1-a}"
VM_NAME="${FITAI_VM_NAME:-fitai-backend-vm}"

for domain in "${FRONTEND_DOMAIN}" "${WWW_DOMAIN}" "${API_DOMAIN}"; do
  if [[ ! "${domain}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${domain}" != *.* ]]; then
    echo "${domain} is not a valid hostname." >&2
    exit 1
  fi
done
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
    for domain in '${FRONTEND_DOMAIN}' '${WWW_DOMAIN}' '${API_DOMAIN}'; do
      resolved_ip=\"\$(getent ahostsv4 \"\${domain}\" | awk 'NR == 1 { print \$1 }')\"
      if [[ \"\${resolved_ip}\" != '${STATIC_IP}' ]]; then
        echo \"DNS is not ready: \${domain} must resolve to ${STATIC_IP}.\" >&2
        exit 1
      fi
    done
    sudo nginx -t
    sudo systemctl reload nginx
    sudo certbot --nginx --non-interactive --agree-tos --redirect --email '${EMAIL}' \
      -d '${FRONTEND_DOMAIN}' -d '${WWW_DOMAIN}' -d '${API_DOMAIN}'
    sudo certbot renew --dry-run"

curl --fail --silent --show-error "https://${FRONTEND_DOMAIN}/signin" >/dev/null
curl --fail --silent --show-error "https://${API_DOMAIN}/health/ready" >/dev/null
echo "Frontend HTTPS is ready at https://${FRONTEND_DOMAIN}"
echo "Backend HTTPS is ready at https://${API_DOMAIN}"
echo "Google OAuth callback: https://${FRONTEND_DOMAIN}/api/auth/callback/google"
