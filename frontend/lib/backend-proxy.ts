type BackendFetchRetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

function abortReason(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted", "AbortError");
}

async function waitForRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal);
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchBackendWithStartupRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  options: BackendFetchRetryOptions = {},
) {
  const attempts = Math.max(1, options.attempts ?? 1);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 125);
  const fetcher = options.fetcher ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    try {
      return await fetcher(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || options.signal?.aborted) throw error;
      await waitForRetry(initialDelayMs * 2 ** attempt, options.signal);
    }
  }

  throw lastError;
}

export function isBackendTransportError(error: unknown) {
  return error instanceof TypeError && /fetch failed|connect|socket|network/i.test(error.message);
}
