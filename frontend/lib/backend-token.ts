import { SignJWT } from "jose";

export type BackendIdentity = {
  id: string;
  email: string;
  name: string;
};

export async function createBackendToken(identity: BackendIdentity) {
  const secretValue = process.env.API_JWT_SECRET;
  if (!secretValue || secretValue.length < 32) {
    throw new Error("API_JWT_SECRET is not configured");
  }

  return new SignJWT({ email: identity.email, name: identity.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.id)
    .setIssuer("fitai-frontend")
    .setAudience("fitai-backend")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secretValue));
}
