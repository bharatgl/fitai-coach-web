#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
REPOSITORY="${FITAI_GCP_REPOSITORY:-fitai}"
MONGODB_DB="${FITAI_MONGODB_DB:-fitai}"
GEMINI_MODEL="${FITAI_GEMINI_MODEL:-gemini-3.1-flash-lite}"
ASSET_BUCKET="${FITAI_ASSET_BUCKET:-${PROJECT_ID}-fitai-assets}"
ASSET_VERSION="${FITAI_ASSET_VERSION:-v1}"
EXERCISE_ASSET_BASE_URL="https://storage.googleapis.com/${ASSET_BUCKET}/${ASSET_VERSION}"
IMAGE_TAG="${FITAI_IMAGE_TAG:-$(git rev-parse --short HEAD)}"
FRONTEND_ACCOUNT="fitai-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_ACCOUNT="fitai-backend@${PROJECT_ID}.iam.gserviceaccount.com"
BUILDER_ACCOUNT="fitai-builder@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/fitai-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/fitai-frontend:${IMAGE_TAG}"

gcloud builds submit . \
  --config=infra/gcp/cloudbuild.yaml \
  --substitutions="_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_TAG=${IMAGE_TAG}" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILDER_ACCOUNT}" \
  --project="${PROJECT_ID}"

gcloud run deploy fitai-backend \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --service-account="${BACKEND_ACCOUNT}" \
  --set-env-vars="NODE_ENV=production,MONGODB_DB=${MONGODB_DB},GEMINI_MODEL=${GEMINI_MODEL},EXERCISE_ASSET_BASE_URL=${EXERCISE_ASSET_BASE_URL}" \
  --set-secrets="MONGODB_URI=fitai-backend-mongodb-uri:latest,API_JWT_SECRET=fitai-api-jwt-secret:latest,GEMINI_API_KEY=fitai-gemini-api-key:latest,USER_PROVIDER_CREDENTIALS_KEY=fitai-provider-credentials-key:latest" \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --timeout=120 \
  --min=0 \
  --max=3 \
  --allow-unauthenticated \
  --project="${PROJECT_ID}" \
  --quiet

BACKEND_URL="$(gcloud run services describe fitai-backend \
  --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"

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

curl --fail --silent --show-error "${BACKEND_URL}/health/live" >/dev/null
curl --fail --silent --show-error "${BACKEND_URL}/health/ready" >/dev/null
curl --fail --silent --show-error "${FRONTEND_URL}/signin" >/dev/null

echo "Backend: ${BACKEND_URL}"
echo "Frontend: ${FRONTEND_URL}"
echo "Add ${FRONTEND_URL}/api/auth/callback/google to the Google OAuth client."
