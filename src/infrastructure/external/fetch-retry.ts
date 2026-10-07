const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with retries on network errors and 5xx/429 (transient DNS / upstream hiccups). */
export async function fetchRetry(url: string, init: RequestInit & { timeoutMs?: number } = {}, attempts = 4): Promise<Response> {
  const { timeoutMs = 60_000, ...rest } = init;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status < 500 && res.status !== 429) return res;
      lastError = new Error(`${url} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts) await sleep(2_000 * 2 ** (i - 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
