// Vendored from tools/astral-harness/src/guide/summary-http.ts (MIT License, Copyright (c) 2026 Milo Lin;
// see tools/astral-harness/LICENSE). Keep in sync with the harness; do not edit only here.
export type SummaryErrorCode =
  | 'invalid_input' | 'not_configured' | 'not_found' | 'ambiguous'
  | 'upstream_error' | 'invalid_response' | 'timeout' | 'response_too_large';

export class SummaryToolError extends Error {
  constructor(readonly code: SummaryErrorCode, message: string, readonly status?: number) {
    super(message);
    this.name = 'SummaryToolError';
  }
}

export interface RequestOptions {
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  service: string;
}

/** Shared transport only: callers interpret the service's JSON or audio response. */
export async function requestBytes(url: string | URL, init: RequestInit, options: RequestOptions) {
  options.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await options.fetchImpl(url, { redirect: 'error', ...init, signal });
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, contentType, bytes: new Uint8Array() };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SummaryToolError('invalid_response', `${options.service} returned an empty body`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > options.maxBytes) {
          await reader.cancel();
          throw new SummaryToolError('response_too_large', `${options.service} response exceeded its size limit`);
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: response.status, contentType, bytes };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (timeout.aborted) throw new SummaryToolError('timeout', `${options.service} request timed out`);
    if (error instanceof SummaryToolError) throw error;
    throw new SummaryToolError('upstream_error', `${options.service} request failed`);
  }
}
