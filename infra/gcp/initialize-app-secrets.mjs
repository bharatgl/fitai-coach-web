import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const projectId = process.env.FITAI_GCP_PROJECT_ID;
if (!projectId) {
  throw new Error("Set FITAI_GCP_PROJECT_ID before initializing app secrets.");
}

for (const name of ["fitai-auth-secret", "fitai-api-jwt-secret"]) {
  const versions = spawnSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "list",
      name,
      "--filter=state:ENABLED",
      "--format=value(name)",
      `--project=${projectId}`,
    ],
    { encoding: "utf8" },
  );

  if (versions.error) throw versions.error;
  if (versions.status !== 0) {
    process.stderr.write(versions.stderr);
    throw new Error(`Failed to inspect ${name}.`);
  }
  if (versions.stdout.trim()) continue;

  const value = randomBytes(48).toString("base64url");
  const upload = spawnSync(
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

  if (upload.error) throw upload.error;
  if (upload.status !== 0) {
    throw new Error(`Failed to initialize ${name}.`);
  }
}

console.log("Production-only Auth.js and API JWT secrets are initialized.");
