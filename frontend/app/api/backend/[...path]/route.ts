import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backend-token";

type RouteContext = { params: Promise<{ path: string[] }> };

/**
 * A caller-supplied id is validated before it is adopted, so a request header
 * cannot inject newlines or unbounded text into our logs.
 */
const acceptableRequestId = /^[A-Za-z0-9_-]{8,64}$/;

function requestIdFor(request: NextRequest) {
  const supplied = request.headers.get("x-request-id");
  return supplied && acceptableRequestId.test(supplied) ? supplied : randomUUID();
}

/**
 * One structured line per proxied request. Route path only — never the query
 * string or body, which carry member context.
 */
function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
}

async function proxy(request: NextRequest, context: RouteContext) {
  const requestId = requestIdFor(request);
  const startedAt = performance.now();

  const { path } = await context.params;
  const isPublicExerciseRequest = request.method === "GET" &&
    (path[0] === "exercises" || path[0] === "exercise-demos");
  const session = isPublicExerciseRequest ? null : await auth();
  if (!isPublicExerciseRequest && (!session?.user?.id || !session.user.email)) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    log({ msg: "proxy.misconfigured", requestId, reason: "BACKEND_API_URL is not set" });
    return Response.json(
      { error: "Backend API is not configured" },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  const route = `/v1/${path.join("/")}`;

  try {
    const requestUrl = new URL(request.url);
    const target = new URL(route, backendUrl);
    target.search = requestUrl.search;
    const token = session?.user?.id && session.user.email
      ? await createBackendToken({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? session.user.email,
      })
      : null;
    const canHaveBody = request.method !== "GET" && request.method !== "HEAD";
    const requestBody = canHaveBody ? await request.arrayBuffer() : undefined;
    const hasBody = Boolean(requestBody?.byteLength);

    const response = await fetch(target, {
      method: request.method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        accept: "application/json",
        "x-request-id": requestId,
        ...(hasBody && request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type")! }
          : {}),
      },
      body: hasBody ? requestBody : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    const durationMs = Math.round(performance.now() - startedAt);
    if (response.status >= 500) {
      log({
        msg: "proxy.upstream_error",
        requestId,
        method: request.method,
        route,
        status: response.status,
        durationMs,
      });
    }

    const responseHeaders = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/json",
      "x-request-id": requestId,
    });
    for (const header of [
      "content-disposition",
      "content-length",
      "cache-control",
      "retry-after",
    ]) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    // Record the cause here rather than handing it to the browser: the internal
    // message can name hosts and configuration. The caller gets the request id
    // instead, which is enough to find this line.
    log({
      msg: "proxy.failed",
      requestId,
      method: request.method,
      route,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    });
    return Response.json(
      { error: "The backend could not be reached. Please try again.", requestId },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
