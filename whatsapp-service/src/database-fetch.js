// Bound REST calls so a database outage cannot hold Signal's key mutex for
// minutes. Storage uploads retain a larger budget for legitimate attachments.
export function databaseFetch(fetcher = fetch, timeoutMs = 12000) {
  return (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const timeout = AbortSignal.timeout(url.includes('/storage/v1/') ? 60000 : timeoutMs);
    const signal = init.signal || (input instanceof Request ? input.signal : null);
    return fetcher(input, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  };
}
