#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="$(curl --fail --silent --show-error \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/project/project-id)"
MONGODB_DB="${FITAI_MONGODB_DB:-fitai}"
INTERNAL_BACKEND_URL="${FITAI_INTERNAL_BACKEND_URL:-http://fitai-backend:8080}"
ENV_FILE="$(mktemp /etc/fitai/frontend.env.XXXXXX)"
trap 'rm -f "${ENV_FILE}"' EXIT
umask 077

secret() {
  gcloud secrets versions access latest \
    --secret="$1" \
    --project="${PROJECT_ID}"
}

{
  printf 'MONGODB_URI=%s\n' "$(secret fitai-frontend-mongodb-uri)"
  printf 'MONGODB_DB=%s\n' "${MONGODB_DB}"
  printf 'AUTH_SECRET=%s\n' "$(secret fitai-auth-secret)"
  printf 'AUTH_GOOGLE_ID=%s\n' "$(secret fitai-google-oauth-id)"
  printf 'AUTH_GOOGLE_SECRET=%s\n' "$(secret fitai-google-oauth-secret)"
  printf 'API_JWT_SECRET=%s\n' "$(secret fitai-api-jwt-secret)"
  printf 'BACKEND_API_URL=%s\n' "${INTERNAL_BACKEND_URL}"
  printf 'AUTH_TRUST_HOST=true\n'
  printf 'PORT=8080\n'
  printf 'NODE_ENV=production\n'
} > "${ENV_FILE}"

chmod 0600 "${ENV_FILE}"
chown root:root "${ENV_FILE}"
mv "${ENV_FILE}" /etc/fitai/frontend.env
trap - EXIT
