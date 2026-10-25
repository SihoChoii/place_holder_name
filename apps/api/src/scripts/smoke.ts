import { randomUUID } from "node:crypto";
import sharp from "sharp";

/**
 * pnpm smoke [base-url] — fresh-data end-to-end check against a RUNNING stack (default http://127.0.0.1:4000),
 * including real moderation and the real guide. No seed approval or mocks: it fails if moderation never finishes.
 */
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const run = randomUUID().slice(0, 8);
let failures = 0;
const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const t = performance.now();
  try {
    const v = await fn();
    console.log(`PASS ${name} (${Math.round(performance.now() - t)} ms)`);
    return v;
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
    throw e;
  }
};
async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  const res = await fetch(`${base}/api${path}`, { ...init, headers });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  return { status: res.status, body: body as any };
}
const expect = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

try {
  await step("health/live", async () => expect((await api("/health/live")).status === 200, "not live"));
  const users = await step("sign up two fresh users", async () => Promise.all(["a", "b"].map(async (n) => {
    const r = await api("/auth/signup", { method: "POST", body: JSON.stringify({ email: `smoke-${run}-${n}@example.com`, password: "smoke-test-password", display_name: `Smoke ${n.toUpperCase()} ${run}` }) });
    expect(r.status === 201, `signup ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  })));
  const [a, b] = users;
  const hyg = await step("claim an unclaimed star", async () => {
    for (let id = 1000 + Math.floor(Math.random() * 50000); ; id++) {
      const r = await api(`/stars/${id}/claim`, { method: "POST", token: a, headers: { "idempotency-key": randomUUID() } });
      if (r.status === 201) return id;
      expect(r.status === 409 || (r.status === 400 && r.body.error.code === "unknown_star"), `claim ${r.status} ${JSON.stringify(r.body)}`);
    }
  });
  const tagId = await step("post note + photo + link", async () => {
    const fd = new FormData();
    fd.append("hyg_id", String(hyg));
    fd.append("note", `Smoke test ${run}: clear skies tonight`);
    fd.append("links", JSON.stringify(["https://science.nasa.gov/universe/stars/"]));
    const img = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 6, g: 10, b: 40 } } }).jpeg().toBuffer();
    fd.append("images", new Blob([new Uint8Array(img)], { type: "image/jpeg" }), "sky.jpg");
    const r = await api("/tags", { method: "POST", token: a, body: fd, headers: { "idempotency-key": randomUUID() } });
    expect(r.status === 201, `post ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.tag.id as string;
  });
  await step("second user cannot see the pending post", async () => expect((await api(`/tags/${tagId}`, { token: b })).status === 404, "pending visible"));
  await step("real moderation approves within 180 s", async () => {
    const deadline = Date.now() + 180_000;
    for (;;) {
      const r = await api(`/tags/${tagId}`, { token: a });
      if (r.body.moderation_status === "approved") return;
      expect(r.body.moderation_status !== "rejected", "post was rejected");
      expect(r.body.processing_state !== "review_failed", "moderation failed (review_failed); check pnpm moderation:list");
      expect(Date.now() < deadline, `still ${r.body.processing_state} after 180 s`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  });
  await step("second user sees it in the overlay; anonymous can load the photo", async () => {
    const r = await api("/view/content", { method: "POST", token: b, body: JSON.stringify({ hyg_ids: [hyg] }) });
    expect(r.body.stars?.[0]?.tags?.[0]?.id === tagId, "not in overlay");
    const img = r.body.stars[0].tags[0].media.find((m: any) => m.kind === "image");
    const pub = await fetch(`${base}/api/public/media/${img.id}`);
    expect(pub.status === 200, `public media ${pub.status}`);
  });
  await step("guide streams a grounded answer", async () => {
    const res = await fetch(`${base}/api/agent/chat`, {
      method: "POST", headers: { authorization: `Bearer ${b}`, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is this star and how far away is it?" }], mode: "local", scope_hyg_ids: [hyg], selected_hyg_id: hyg }),
    });
    expect(res.status === 200, `chat ${res.status} ${await res.text()}`);
    const text = await res.text();
    expect(/event: done/.test(text), `no done event: ${text.slice(0, 300)}`);
  });
} catch {
  /* reported above */
}
console.log(failures ? `\nSMOKE FAILED (${failures})` : "\nSMOKE PASSED");
process.exit(failures ? 1 : 0);
