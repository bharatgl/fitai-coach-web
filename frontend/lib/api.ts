export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path.replace(/^\/v1/, "")}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | ({ error?: string } & T)
    | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }
  return body as T;
}
