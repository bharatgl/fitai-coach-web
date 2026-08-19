import type { FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { getConfig } from "./config.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};

export async function authenticate(
  request: FastifyRequest,
): Promise<AuthenticatedUser> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const secret = new TextEncoder().encode(getConfig().API_JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, {
    issuer: "fitai-frontend",
    audience: "fitai-backend",
  });

  if (!payload.sub || typeof payload.email !== "string") {
    throw Object.assign(new Error("Invalid authentication token"), {
      statusCode: 401,
    });
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : payload.email,
  };
}
