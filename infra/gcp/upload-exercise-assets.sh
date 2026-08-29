#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
BUCKET_NAME="${FITAI_ASSET_BUCKET:-${PROJECT_ID}-fitai-assets}"
ASSET_VERSION="${FITAI_ASSET_VERSION:-v1}"
BUCKET="gs://${BUCKET_NAME}"
DESTINATION="${BUCKET}/${ASSET_VERSION}/exercises"

if ! gcloud storage buckets describe "${BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "${BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
fi

gcloud storage buckets update "${BUCKET}" \
  --cors-file=infra/gcp/exercise-assets-cors.json \
  --project="${PROJECT_ID}" >/dev/null

gcloud storage buckets add-iam-policy-binding "${BUCKET}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" \
  --project="${PROJECT_ID}" >/dev/null

gcloud storage rsync frontend/public/exercises "${DESTINATION}" \
  --recursive \
  --cache-control="public,max-age=31536000,immutable" \
  --no-user-output-enabled

echo "Exercise assets uploaded to ${DESTINATION}"
echo "Set EXERCISE_ASSET_BASE_URL=https://storage.googleapis.com/${BUCKET_NAME}/${ASSET_VERSION}"
