export const BACKEND_WAKE_MESSAGE = {
  title: 'Preparing Squad Registration',
  body: 'Our squad registration system is waking up. This may take a little while. Please wait while we get everything ready.',
  reminder: "Please don't refresh the page or submit your screenshots again.",
};

export async function waitForVisionBackend({
  fetchImpl = fetch,
  healthUrl = '/api/health',
  onWaking = () => {},
  signal,
  attempts = 8,
  intervalMs = 3000,
  timeoutMs = 12000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  let wakingShown = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const requestController = new AbortController();
    const abortFromParent = () => requestController.abort();
    signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(() => requestController.abort(), timeoutMs);
    try {
      const response = await fetchImpl(healthUrl, {
        method: 'GET',
        signal: requestController.signal,
        cache: 'no-store',
      });
      const data = response.ok ? await response.json().catch(() => null) : null;
      if (response.ok && data?.status === 'ok') return { wakingShown };
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
    }

    if (!wakingShown) {
      wakingShown = true;
      onWaking();
    }
    if (attempt + 1 < attempts) await wait(intervalMs);
  }
  const error = new Error('The squad service did not become available in time.');
  error.code = 'BACKEND_UNAVAILABLE';
  error.wakingShown = wakingShown;
  throw error;
}
