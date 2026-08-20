#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="$(curl --fail --silent --show-error \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/project/project-id)"
MONGODB_DB="${FITAI_MONGODB_DB:-fitai}"
GEMINI_MODEL="${FITAI_GEMINI_MODEL:-gemini-3.1-flash-lite}"
ENV_FILE="$(mktemp /etc/fitai/backend.env.XXXXXX)"
trap 'rm -f "${ENV_FILE}"' EXIT
umask 077

secret() {
  gcloud secrets versions access latest \
    --secret="$1" \
    --project="${PROJECT_ID}"
}

{
  printf 'MONGODB_URI=%s\n' "$(secret fitai-backend-mongodb-uri)"
  printf 'MONGODB_DB=%s\n' "${MONGODB_DB}"
  printf 'API_JWT_SECRET=%s\n' "$(secret fitai-api-jwt-secret)"
  printf 'GEMINI_API_KEY=%s\n' "$(secret fitai-gemini-api-key)"
  printf 'GEMINI_MODEL=%s\n' "${GEMINI_MODEL}"
  printf 'PORT=8080\n'
  printf 'NODE_ENV=production\n'
} > "${ENV_FILE}"

chmod 0600 "${ENV_FILE}"
chown root:root "${ENV_FILE}"
mv "${ENV_FILE}" /etc/fitai/backend.env
trap - EXIT
