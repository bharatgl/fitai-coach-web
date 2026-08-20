#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
BACKEND_URL="${FITAI_BACKEND_URL:?Set FITAI_BACKEND_URL to the backend HTTPS URL}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
REPOSITORY="${FITAI_GCP_REPOSITORY:-fitai}"
MONGODB_DB="${FITAI_MONGODB_DB:-fitai}"
IMAGE_TAG="${FITAI_IMAGE_TAG:-$(tr -d '\n' < infra/gcp/image-tag)}"
FRONTEND_ACCOUNT="fitai-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/fitai-frontend:${IMAGE_TAG}"

if [[ "${BACKEND_URL}" != https://* ]]; then
  echo "FITAI_BACKEND_URL must use HTTPS before the production frontend is deployed." >&2
  exit 1
fi

gcloud run deploy fitai-frontend \
  --image="${FRONTEND_IMAGE}" \
  --region="${REGION}" \
  --service-account="${FRONTEND_ACCOUNT}" \
  --set-env-vars="NODE_ENV=production,MONGODB_DB=${MONGODB_DB},BACKEND_API_URL=${BACKEND_URL},AUTH_TRUST_HOST=true" \
  --set-secrets="MONGODB_URI=fitai-frontend-mongodb-uri:latest,AUTH_SECRET=fitai-auth-secret:latest,AUTH_GOOGLE_ID=fitai-google-oauth-id:latest,AUTH_GOOGLE_SECRET=fitai-google-oauth-secret:latest,API_JWT_SECRET=fitai-api-jwt-secret:latest" \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --timeout=60 \
  --min=0 \
  --max=3 \
  --allow-unauthenticated \
  --project="${PROJECT_ID}" \
  --quiet

FRONTEND_URL="$(gcloud run services describe fitai-frontend \
  --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"

curl --fail --silent --show-error "${FRONTEND_URL}/signin" >/dev/null
echo "Frontend: ${FRONTEND_URL}"
echo "Google OAuth callback: ${FRONTEND_URL}/api/auth/callback/google"
