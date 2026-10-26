import { request, RequestError, conforms } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  mode: "local" | "explore";
  scope_hyg_ids?: number[];
  selected_hyg_id?: number | null;
}

export interface ChatStartEvent {
  request_id: string;
}

export interface ChatDeltaEvent {
  text: string;
}

export interface ChatDoneEvent {
  request_id: string;
}

export interface ChatErrorEvent {
  code: "guide_unavailable" | "guide_timeout" | "internal_error";
  message: string;
}

export type ChatStreamEvent =
  | { type: "start"; data: ChatStartEvent }
  | { type: "delta"; data: ChatDeltaEvent }
  | { type: "done"; data: ChatDoneEvent }
  | { type: "error"; data: ChatErrorEvent };

export interface StarSummaryRequest {
  hyg_id: number;
  audio?: boolean;
}

export interface StarSummaryResponse {
  hyg_id: number;
  title: string;
  blurb: string;
  source: {
    title: string;
    url: string;
  };
  audio: {
    mime_type: "audio/mpeg";
    base64: string;
  } | null;
}

const summarySchema = {
  type: "object",
  required: ["hyg_id", "title", "blurb", "source", "audio"],
  properties: {
    hyg_id: { type: "integer", minimum: 0 },
    title: { type: "string" },
    blurb: { type: "string" },
    source: {
      type: "object",
      required: ["title", "url"],
      properties: {
        title: { type: "string" },
        url: { type: "string" },
      },
    },
    audio: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          required: ["mime_type", "base64"],
          properties: {
            mime_type: { type: "string", enum: ["audio/mpeg"] },
            base64: { type: "string" },
          },
        },
      ],
    },
  },
} as const;

export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const response = await fetch("/api/agent/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = (body as { error?: { message?: string; code?: string } })
      ?.error;
    throw new RequestError(
      typeof error?.message === "string"
        ? error.message
        : "The service could not complete the request.",
      response.status,
      error?.code,
      Number(response.headers.get("retry-after")) || 0,
    );
  }

  if (!response.body) {
    throw new RequestError(
      "No response body received.",
      0,
      "invalid_response",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          currentEvent = null;
          continue;
        }

        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }

        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            const event = parseSSEEvent(currentEvent, data);
            if (event) yield event;
          } catch {
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEEvent(
  eventType: string | null,
  data: unknown,
): ChatStreamEvent | null {
  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, unknown>;

  if (eventType === "start" && "request_id" in obj && typeof obj.request_id === "string") {
    return { type: "start", data: { request_id: obj.request_id } };
  }

  if (eventType === "delta" && "text" in obj && typeof obj.text === "string") {
    return { type: "delta", data: { text: obj.text } };
  }

  if (eventType === "done" && "request_id" in obj && typeof obj.request_id === "string") {
    return { type: "done", data: { request_id: obj.request_id } };
  }

  if (
    eventType === "error" &&
    "code" in obj &&
    typeof obj.code === "string" &&
    "message" in obj &&
    typeof obj.message === "string"
  ) {
    return {
      type: "error",
      data: {
        code: obj.code as ChatErrorEvent["code"],
        message: obj.message,
      },
    };
  }

  return null;
}

export async function fetchStarSummary(
  req: StarSummaryRequest,
): Promise<StarSummaryResponse> {
  return request<StarSummaryResponse>(
    "/agent/summary",
    summarySchema,
    {
      method: "POST",
      body: JSON.stringify(req),
    },
  );
}
