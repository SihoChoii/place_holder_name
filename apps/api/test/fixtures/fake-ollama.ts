/**
 * TEST FIXTURE ONLY: a tiny fake model server for automated tests. It imitates Ollama's /api/chat (Gemma),
 * the OpenAI-compatible /v1/chat/completions + /v1/models (Unsloth) and /v1/systemone (Clef) closely enough
 * to exercise our adapters. When `apiKey` is set every request needs `Authorization: Bearer <apiKey>`.
 * It is never used by the application.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeOllama {
  url: string;
  mode: "ok" | "error" | "malformed" | "hang";
  calls: { path: string; body: any; auth?: string }[];
  apiKey?: string;
  /** /v1/models entries (OpenAI style). */
  openaiModels: { id: string; loaded?: boolean }[];
  close(): Promise<void>;
}

export async function startFakeOllama(port = 0): Promise<FakeOllama> {
  const fake: FakeOllama = { url: "", mode: "ok", calls: [], openaiModels: [{ id: "fake", loaded: true }], close: async () => {} };
  const server: Server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    fake.calls.push({ path: req.url ?? "", body, auth: req.headers.authorization });
    if (fake.mode === "hang") return; // never answers; client deadline must fire
    if (fake.apiKey && req.headers.authorization !== `Bearer ${fake.apiKey}`) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"detail":"Invalid API key"}');
      return;
    }
    if (fake.mode === "error") { res.writeHead(500).end('{"error":"boom"}'); return; }
    if (req.url === "/api/tags") return json(res, { models: [{ name: "fake", model: "fake", digest: "sha256:fake", size: 1 }] });
    if (req.url === "/api/version") return json(res, { version: "0.0.0-fake" });
    if (req.url === "/v1/systemone") {
      if (fake.mode === "malformed") return json(res, { answers: {} });
      const text = JSON.stringify(body.state);
      const answers: Record<string, unknown> = {};
      for (const q of Object.keys(body.questions)) {
        const bad = (q === "targeted_abuse" && text.includes("REJECT_ME")) || (q === "sexual" && (body.images?.length ?? 0) > 0 && text.includes("never"));
        answers[q] = { type: "noul", noul: bad ? 0.97 : 0.02 };
      }
      return json(res, { model: body.model, answers, usage: { input_tokens: 10, output_tokens: 1 } });
    }
    if (req.url === "/v1/models") return json(res, { object: "list", data: fake.openaiModels.map((m) => ({ object: "model", ...m })) });
    if (req.url === "/v1/chat/completions") {
      const last = body.messages[body.messages.length - 1];
      if (!body.stream) {
        const m = /tool:(\w+):(\d+)/.exec(last.content ?? "");
        const message = m && body.tools
          ? { role: "assistant", content: null, tool_calls: [{ id: "call_fake_1", type: "function", function: { name: m[1], arguments: last.content.includes("badargs") ? "{hyg_id:" : JSON.stringify({ hyg_id: Number(m[2]) }) } }] }
          : { role: "assistant", content: "OK", reasoning_content: "secret thoughts" };
        return json(res, { id: "x", object: "chat.completion", model: body.model, choices: [{ index: 0, message, finish_reason: "stop" }] });
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (fake.mode === "malformed") { res.end("data: {not json\n\n"); return; }
      const tool = body.messages.find((m: any) => m.role === "tool");
      const answer = `Sirius ✨ is bright.${tool ? ` Tool said ${tool.content}` : ""}`;
      const chunk = (delta: object) => `data: ${JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
      const sse = Buffer.from(
        ": keep-alive\n\n" + chunk({ role: "assistant", reasoning_content: "hidden reasoning" }) +
          [...answer.match(/.{1,7}/gsu)!].map((t) => chunk({ content: t })).join("") + "data: [DONE]\n\n",
      );
      for (let i = 0; i < sse.length; i += 5) res.write(sse.subarray(i, i + 5));
      res.end();
      return;
    }
    if (req.url === "/api/chat") {
      const last = body.messages[body.messages.length - 1];
      if (!body.stream) {
        const m = /tool:(\w+):(\d+)/.exec(last.content ?? "");
        const message = m && body.tools
          ? { role: "assistant", content: "", tool_calls: [{ function: { name: m[1], arguments: { hyg_id: Number(m[2]) } } }] }
          : { role: "assistant", content: "OK" };
        return json(res, { model: body.model, message, done: true });
      }
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      if (fake.mode === "malformed") { res.end("{not json\n"); return; }
      const tool = body.messages.find((m: any) => m.role === "tool");
      const answer = `Sirius ✨ is bright.${tool ? ` Tool said ${tool.content}` : ""}`;
      // Split the NDJSON bytes at awkward places (inside the multibyte ✨ and mid-line).
      const ndjson = Buffer.from(
        [...answer.match(/.{1,7}/gsu)!].map((t) => JSON.stringify({ message: { role: "assistant", content: t }, done: false })).join("\n") +
          "\n" + JSON.stringify({ message: { role: "assistant", content: "" }, done: true }) + "\n",
      );
      for (let i = 0; i < ndjson.length; i += 5) res.write(ndjson.subarray(i, i + 5));
      res.end();
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return fake;
}

function json(res: import("node:http").ServerResponse, v: unknown) {
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(v));
}
