#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="$(curl --fail --silent --show-error \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/project/project-id)"
MONGODB_DB="${FITAI_MONGODB_DB:-fitai}"
GEMINI_MODEL="${FITAI_GEMINI_MODEL:-gemini-3.1-flash-lite}"
VERTEX_AI_LOCATION="${FITAI_VERTEX_AI_LOCATION:-global}"
VERTEX_AI_RESEARCH_MODEL="${FITAI_VERTEX_AI_RESEARCH_MODEL:-gemini-2.5-flash}"
RESEARCH_DAILY_LIMIT="${FITAI_RESEARCH_DAILY_LIMIT:-20}"
ASSET_BUCKET="${FITAI_ASSET_BUCKET:-${PROJECT_ID}-fitai-assets}"
ASSET_VERSION="${FITAI_ASSET_VERSION:-v1}"
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
  printf 'ELEVENLABS_API_KEY=%s\n' "$(secret fitai-elevenlabs-api-key)"
  printf 'USER_PROVIDER_CREDENTIALS_KEY=%s\n' "$(secret fitai-provider-credentials-key)"
  printf 'GEMINI_MODEL=%s\n' "${GEMINI_MODEL}"
  printf 'VERTEX_AI_PROJECT=%s\n' "${PROJECT_ID}"
  printf 'VERTEX_AI_LOCATION=%s\n' "${VERTEX_AI_LOCATION}"
  printf 'VERTEX_AI_RESEARCH_MODEL=%s\n' "${VERTEX_AI_RESEARCH_MODEL}"
  printf 'RESEARCH_DAILY_LIMIT=%s\n' "${RESEARCH_DAILY_LIMIT}"
  printf 'EXERCISE_ASSET_BASE_URL=https://storage.googleapis.com/%s/%s\n' "${ASSET_BUCKET}" "${ASSET_VERSION}"
  printf 'PORT=8080\n'
  printf 'NODE_ENV=production\n'
} > "${ENV_FILE}"

chmod 0600 "${ENV_FILE}"
chown root:root "${ENV_FILE}"
mv "${ENV_FILE}" /etc/fitai/backend.env
trap - EXIT
