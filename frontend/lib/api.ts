export class ApiRequestError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/api/backend${path.replace(/^\/v1/, "")}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as
    | ({ error?: string; message?: string } & T)
    | null;
  if (!response.ok) {
    const fallbackMessage = response.status === 413
      ? "That upload is too large for the server. Choose a file under 5 MB."
      : `API request failed with ${response.status}`;
    throw new ApiRequestError(
      body?.message ?? body?.error ?? fallbackMessage,
      response.status,
      retryAfterSeconds(response),
    );
  }
  return body as T;
}
