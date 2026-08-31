#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FITAI_GCP_PROJECT_ID:?Set FITAI_GCP_PROJECT_ID to your Google Cloud project ID}"
REGION="${FITAI_GCP_REGION:-asia-south1}"
ZONE="${FITAI_GCP_ZONE:-asia-south1-a}"
MACHINE_TYPE="${FITAI_VM_MACHINE_TYPE:-e2-small}"
VM_NAME="${FITAI_VM_NAME:-fitai-backend-vm}"
NETWORK="${FITAI_VM_NETWORK:-fitai-vpc}"
SUBNET="${FITAI_VM_SUBNET:-fitai-subnet}"
ADDRESS_NAME="${FITAI_VM_ADDRESS_NAME:-fitai-backend-ip}"
REPOSITORY="${FITAI_GCP_REPOSITORY:-fitai}"
BACKEND_ACCOUNT="fitai-backend@${PROJECT_ID}.iam.gserviceaccount.com"
ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"

if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "No active gcloud account. Run gcloud auth login first." >&2
  exit 1
fi

gcloud services enable \
  aiplatform.googleapis.com \
  compute.googleapis.com \
  iap.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud compute networks describe "${NETWORK}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute networks create "${NETWORK}" \
    --subnet-mode=custom \
    --project="${PROJECT_ID}"
fi

if ! gcloud compute networks subnets describe "${SUBNET}" \
  --region="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute networks subnets create "${SUBNET}" \
    --network="${NETWORK}" \
    --range=10.42.0.0/24 \
    --region="${REGION}" \
    --project="${PROJECT_ID}"
fi

if ! gcloud compute firewall-rules describe fitai-allow-web \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules create fitai-allow-web \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=fitai-backend \
    --project="${PROJECT_ID}"
fi

if ! gcloud compute firewall-rules describe fitai-allow-iap-ssh \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules create fitai-allow-iap-ssh \
    --network="${NETWORK}" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 \
    --target-tags=fitai-backend \
    --project="${PROJECT_ID}"
fi

if ! gcloud compute addresses describe "${ADDRESS_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute addresses create "${ADDRESS_NAME}" \
    --region="${REGION}" \
    --network-tier=PREMIUM \
    --project="${PROJECT_ID}"
fi

STATIC_IP="$(gcloud compute addresses describe "${ADDRESS_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" --format='value(address)')"

gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" \
  --member="serviceAccount:${BACKEND_ACCOUNT}" \
  --role="roles/artifactregistry.reader" \
  --project="${PROJECT_ID}" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${ACTIVE_ACCOUNT}" \
  --role="roles/iap.tunnelResourceAccessor" >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="user:${ACTIVE_ACCOUNT}" \
  --role="roles/compute.osAdminLogin" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "${BACKEND_ACCOUNT}" \
  --member="user:${ACTIVE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}" >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BACKEND_ACCOUNT}" \
  --role="roles/aiplatform.user" >/dev/null

VM_SECRETS=(
  fitai-frontend-mongodb-uri
  fitai-auth-secret
  fitai-google-oauth-id
  fitai-google-oauth-secret
  fitai-api-jwt-secret
)

for secret in "${VM_SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${BACKEND_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" >/dev/null
done

if ! gcloud compute instances describe "${VM_NAME}" \
  --zone="${ZONE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute instances create "${VM_NAME}" \
    --zone="${ZONE}" \
    --machine-type="${MACHINE_TYPE}" \
    --network-interface="network=${NETWORK},subnet=${SUBNET},address=${STATIC_IP},network-tier=PREMIUM" \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-balanced \
    --service-account="${BACKEND_ACCOUNT}" \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --tags=fitai-backend \
    --metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE \
    --metadata-from-file=startup-script=infra/gcp/vm/startup.sh \
    --shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --project="${PROJECT_ID}"
fi

echo "VM: ${VM_NAME} (${MACHINE_TYPE}, ${ZONE})"
echo "Static public IP: ${STATIC_IP}"
echo "SSH: gcloud compute ssh ${VM_NAME} --zone=${ZONE} --tunnel-through-iap --project=${PROJECT_ID}"
echo "Add ${STATIC_IP}/32 to the MongoDB Atlas network access list."
echo "Next: deploy both containers, then point the frontend and API domains to ${STATIC_IP}."
