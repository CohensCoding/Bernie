/**
 * HTTP helper for Layer 2 source adapters.
 *
 * Implements the reliability rule for external calls:
 *   - 5-second timeout per attempt
 *   - 1 retry on transient failure (network error, 5xx, 429), with
 *     exponential backoff starting at 250ms
 *   - The retry budget is strict: at most ONE retry (two attempts total)
 *
 * Authentication failures (401/403) are NOT retried — they will not
 * succeed without operator intervention, and a hot-loop wastes the
 * timeout budget.
 *
 * Callers wrap this with their own try/catch and surface
 * `CompFetchResult { ok: false }` rather than throwing all the way up.
 */

export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_RETRY_DELAY_MS = 250;

export type FetchWithRetryOptions = {
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Optional logger; defaults to console.warn for transient retries. */
  warn?: (msg: string) => void;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Fetch with timeout + at-most-1-retry. Resolves with the `Response` on
 * success (status < 500 and not 429). Throws on terminal failure.
 *
 *   const res = await fetchWithRetry(url, { headers });
 *   if (!res.ok) ...
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const warn = opts.warn ?? ((m) => console.warn(`[layer2/http] ${m}`));

  let attempt = 0;
  const maxAttempts = 2;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res;
      if (isRetriableStatus(res.status) && attempt < maxAttempts) {
        warn(`retriable ${res.status} on attempt ${attempt} for ${url}`);
        await sleep(retryDelayMs * attempt);
        continue;
      }
      // Non-retriable status: surface a non-ok Response. Caller decides.
      if (!isRetriableStatus(res.status)) return res;
      // Retriable but out of budget: throw so the caller knows.
      throw new HttpError(`HTTP ${res.status} after ${attempt} attempts`, res.status, true);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const isHttp = e instanceof HttpError;
      const retriable =
        isAbort || (isHttp && e.retriable) || (!isHttp && e instanceof Error);
      if (!retriable || attempt >= maxAttempts) {
        throw e;
      }
      warn(`transient error on attempt ${attempt} for ${url}: ${(e as Error).message}`);
      await sleep(retryDelayMs * attempt);
    }
  }

  // Unreachable but the type system can't see that.
  throw lastErr instanceof Error
    ? lastErr
    : new Error('fetchWithRetry: exhausted retry budget without an error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { HttpError };
