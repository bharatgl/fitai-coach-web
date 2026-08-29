#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
REPOSITORY="${FITAI_GCP_REPOSITORY:-fitai}"
FRONTEND_ACCOUNT="fitai-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_ACCOUNT="fitai-backend@${PROJECT_ID}.iam.gserviceaccount.com"
BUILDER_ACCOUNT="fitai-builder@${PROJECT_ID}.iam.gserviceaccount.com"
SOURCE_BUCKET="gs://${PROJECT_ID}_cloudbuild"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="FitAI Coach Cloud Run images" \
    --project="${PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${FRONTEND_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create fitai-frontend \
    --display-name="FitAI frontend Cloud Run identity" \
    --project="${PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${BACKEND_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create fitai-backend \
    --display-name="FitAI backend Cloud Run identity" \
    --project="${PROJECT_ID}"
fi

if ! gcloud iam service-accounts describe "${BUILDER_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create fitai-builder \
    --display-name="FitAI least-privilege Cloud Build identity" \
    --project="${PROJECT_ID}"
fi

if ! gcloud storage buckets describe "${SOURCE_BUCKET}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "${SOURCE_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
fi

gcloud storage buckets add-iam-policy-binding "${SOURCE_BUCKET}" \
  --member="serviceAccount:${BUILDER_ACCOUNT}" \
  --role="roles/storage.objectViewer" \
  --project="${PROJECT_ID}" >/dev/null

gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" \
  --member="serviceAccount:${BUILDER_ACCOUNT}" \
  --role="roles/artifactregistry.writer" \
  --project="${PROJECT_ID}" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BUILDER_ACCOUNT}" \
  --role="roles/logging.logWriter" >/dev/null

FRONTEND_SECRETS=(
  fitai-frontend-mongodb-uri
  fitai-auth-secret
  fitai-google-oauth-id
  fitai-google-oauth-secret
  fitai-api-jwt-secret
)
BACKEND_SECRETS=(
  fitai-backend-mongodb-uri
  fitai-api-jwt-secret
  fitai-gemini-api-key
  fitai-provider-credentials-key
)

for secret in "${FRONTEND_SECRETS[@]}" "${BACKEND_SECRETS[@]}"; do
  if ! gcloud secrets describe "${secret}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${secret}" \
      --replication-policy=automatic \
      --project="${PROJECT_ID}"
  fi
done

for secret in "${FRONTEND_SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${FRONTEND_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" >/dev/null
done

for secret in "${BACKEND_SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${BACKEND_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" >/dev/null
done

echo "GCP foundation and least-privilege build identity are ready in ${PROJECT_ID}/${REGION}."
echo "Rotate exposed credentials, then run sync-secrets.mjs before deployment."
