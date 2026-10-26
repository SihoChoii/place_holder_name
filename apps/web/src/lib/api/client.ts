import type { ApiError } from "@stargaze/shared";

export class RequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "unavailable",
    public retryAfter = 0,
  ) {
    super(message);
  }
}

/** Small response validator for the shared JSON Schema subset. Fail closed on malformed data. */
export function conforms(value: unknown, schema: unknown): boolean {
  const s = schema as {
    anyOf?: unknown[];
    enum?: unknown[];
    type?: string;
    required?: string[];
    properties?: Record<string, unknown>;
    items?: unknown;
    additionalProperties?: unknown;
    minimum?: number;
    maximum?: number;
  };
  if (s.anyOf) return s.anyOf.some((v) => conforms(value, v));
  if (s.enum && !s.enum.includes(value)) return false;
  if (s.type === "null") return value === null;
  if (s.type === "array")
    return Array.isArray(value) && value.every((v) => conforms(v, s.items));
  if (s.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return false;
    const o = value as Record<string, unknown>;
    return (
      (s.required ?? []).every((k) => Object.hasOwn(o, k)) &&
      Object.entries(o).every(([k, v]) =>
        s.properties?.[k]
          ? conforms(v, s.properties[k])
          : typeof s.additionalProperties === "object"
            ? conforms(v, s.additionalProperties)
            : s.additionalProperties !== false,
      )
    );
  }
  if (s.type === "number" || s.type === "integer")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (s.type !== "integer" || Number.isInteger(value)) &&
      (s.minimum === undefined || value >= s.minimum) &&
      (s.maximum === undefined || value <= s.maximum)
    );
  return !s.type || typeof value === s.type;
}

export async function request<T>(
  path: string,
  schema?: unknown,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(10_000),
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new RequestError("The service could not be reached. Try again.");
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiError | null)?.error;
    throw new RequestError(
      typeof error?.message === "string"
        ? error.message
        : "The service could not complete the request.",
      response.status,
      error?.code,
      Number(response.headers.get("retry-after")) ||
        error?.retry_after_seconds ||
        0,
    );
  }
  if (schema && !conforms(body, schema))
    throw new RequestError(
      "The service returned an unexpected response. Try again.",
      0,
      "invalid_response",
    );
  return body as T;
}

export const starHref = (id: number) => `/star?hyg_id=${id}`;
export function internalReturn(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  const u = new URL(value, "https://stargaze.invalid");
  return ["/", "/star", "/catalog", "/credits"].includes(u.pathname)
    ? u.pathname + u.search
    : "/";
}
