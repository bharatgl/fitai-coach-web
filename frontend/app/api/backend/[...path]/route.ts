import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backend-token";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    return Response.json({ error: "Backend API is not configured" }, { status: 503 });
  }

  try {
    const { path } = await context.params;
    const requestUrl = new URL(request.url);
    const target = new URL(`/v1/${path.join("/")}`, backendUrl);
    target.search = requestUrl.search;
    const token = await createBackendToken({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? session.user.email,
    });
    const canHaveBody = request.method !== "GET" && request.method !== "HEAD";
    const requestBody = canHaveBody ? await request.arrayBuffer() : undefined;
    const hasBody = Boolean(requestBody?.byteLength);

    const response = await fetch(target, {
      method: request.method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(hasBody && request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type")! }
          : {}),
      },
      body: hasBody ? requestBody : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    const responseHeaders = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/json",
    });
    for (const header of ["content-disposition", "content-length", "cache-control"]) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
