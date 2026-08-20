import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

const projectId = process.env.FITAI_GCP_PROJECT_ID;
if (!projectId) {
  throw new Error("Set FITAI_GCP_PROJECT_ID before syncing secrets.");
}

const frontend = parseEnv(readFileSync("frontend/.env.local", "utf8"));
const backend = parseEnv(readFileSync("backend/.env", "utf8"));

const secretValues = new Map([
  ["fitai-frontend-mongodb-uri", frontend.MONGODB_URI],
  ["fitai-backend-mongodb-uri", backend.MONGODB_URI],
  ["fitai-google-oauth-id", frontend.AUTH_GOOGLE_ID],
  ["fitai-google-oauth-secret", frontend.AUTH_GOOGLE_SECRET],
  ["fitai-gemini-api-key", backend.GEMINI_API_KEY],
]);

for (const [name, value] of secretValues) {
  if (!value) {
    throw new Error(`Missing value for ${name} in the private environment files.`);
  }

  const result = spawnSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "add",
      name,
      "--data-file=-",
      `--project=${projectId}`,
    ],
    {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Failed to upload ${name}.`);
  }
}

console.log("Secret versions uploaded without printing their values.");
