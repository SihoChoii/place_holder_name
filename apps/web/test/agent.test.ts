import test from "node:test";
import assert from "node:assert/strict";
import { conforms } from "../src/lib/api/client";

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

test("star summary response validates with and without audio", () => {
  const withAudio = {
    hyg_id: 32263,
    title: "Sirius",
    blurb: "The brightest star in the night sky.",
    source: {
      title: "Wikipedia: Sirius",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: {
      mime_type: "audio/mpeg",
      base64: "SGVsbG8gd29ybGQ=",
    },
  };
  assert.equal(conforms(withAudio, summarySchema), true);

  const withoutAudio = {
    hyg_id: 32263,
    title: "Sirius",
    blurb: "The brightest star in the night sky.",
    source: {
      title: "Wikipedia: Sirius",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: null,
  };
  assert.equal(conforms(withoutAudio, summarySchema), true);
});

test("star summary response fails with missing required fields", () => {
  const missingTitle = {
    hyg_id: 32263,
    blurb: "The brightest star.",
    source: {
      title: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: null,
  };
  assert.equal(conforms(missingTitle, summarySchema), false);

  const missingSource = {
    hyg_id: 32263,
    title: "Sirius",
    blurb: "The brightest star.",
    audio: null,
  };
  assert.equal(conforms(missingSource, summarySchema), false);

  const invalidHygId = {
    hyg_id: -1,
    title: "Sirius",
    blurb: "The brightest star.",
    source: {
      title: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: null,
  };
  assert.equal(conforms(invalidHygId, summarySchema), false);
});

test("star summary response fails with invalid audio format", () => {
  const wrongMimeType = {
    hyg_id: 32263,
    title: "Sirius",
    blurb: "The brightest star.",
    source: {
      title: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: {
      mime_type: "audio/wav",
      base64: "data",
    },
  };
  assert.equal(conforms(wrongMimeType, summarySchema), false);

  const missingBase64 = {
    hyg_id: 32263,
    title: "Sirius",
    blurb: "The brightest star.",
    source: {
      title: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Sirius",
    },
    audio: {
      mime_type: "audio/mpeg",
    },
  };
  assert.equal(conforms(missingBase64, summarySchema), false);
});

test("SSE event parser handles chat events correctly", async () => {
  const events: Array<{
    type: string;
    data: Record<string, unknown>;
  }> = [];

  const mockStream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('event: start\ndata: {"request_id":"abc123"}\n\n'),
      );
      controller.enqueue(
        new TextEncoder().encode('event: delta\ndata: {"text":"Hello"}\n\n'),
      );
      controller.enqueue(
        new TextEncoder().encode('event: delta\ndata: {"text":" world"}\n\n'),
      );
      controller.enqueue(
        new TextEncoder().encode('event: done\ndata: {"request_id":"abc123"}\n\n'),
      );
      controller.close();
    },
  });

  const reader = mockStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

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
        const data = JSON.parse(dataStr);
        if (currentEvent) {
          events.push({ type: currentEvent, data });
        }
      }
    }
  }

  assert.equal(events.length, 4);
  assert.equal(events[0].type, "start");
  assert.equal(events[0].data.request_id, "abc123");
  assert.equal(events[1].type, "delta");
  assert.equal(events[1].data.text, "Hello");
  assert.equal(events[2].type, "delta");
  assert.equal(events[2].data.text, " world");
  assert.equal(events[3].type, "done");
  assert.equal(events[3].data.request_id, "abc123");
});

test("SSE event parser handles error events", async () => {
  const events: Array<{
    type: string;
    data: Record<string, unknown>;
  }> = [];

  const mockStream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('event: start\ndata: {"request_id":"abc123"}\n\n'),
      );
      controller.enqueue(
        new TextEncoder().encode(
          'event: error\ndata: {"code":"guide_timeout","message":"Request timed out"}\n\n',
        ),
      );
      controller.close();
    },
  });

  const reader = mockStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

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
        const data = JSON.parse(dataStr);
        if (currentEvent) {
          events.push({ type: currentEvent, data });
        }
      }
    }
  }

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "start");
  assert.equal(events[1].type, "error");
  assert.equal(events[1].data.code, "guide_timeout");
  assert.equal(events[1].data.message, "Request timed out");
});

test("SSE event parser handles chunk boundaries correctly", async () => {
  const events: Array<{
    type: string;
    data: Record<string, unknown>;
  }> = [];

  const mockStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: start\ndata: {"requ'));
      controller.enqueue(new TextEncoder().encode('est_id":"abc123"}\n\n'));
      controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"tex'));
      controller.enqueue(new TextEncoder().encode('t":"Hello"}\n\n'));
      controller.close();
    },
  });

  const reader = mockStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

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
          if (currentEvent) {
            events.push({ type: currentEvent, data });
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "start");
  assert.equal(events[0].data.request_id, "abc123");
  assert.equal(events[1].type, "delta");
  assert.equal(events[1].data.text, "Hello");
});
