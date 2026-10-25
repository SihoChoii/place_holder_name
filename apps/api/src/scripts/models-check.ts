import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { LIMITS } from "@stargaze/shared";
import { loadConfig } from "../config.js";
import { fromRoot } from "../lib/paths.js";
import { ClefClient } from "../models/clef.js";
import { GemmaClient } from "../models/gemma.js";
import { listModels, ollamaVersion } from "../models/http.js";
import { CATEGORIES, POLICY_VERSION, questionsFor, verdict, type Category } from "../moderation/policy.js";
import { TOOL_SCHEMAS } from "../guide/tools.js";

/**
 * pnpm models:check — real preflight against GUIDE_BASE_URL / CLEF_BASE_URL from this machine (spec §4).
 * Every result is measured, never assumed. `--write-lock` records versions/digests in docs/model-lock.json
 * only when every check passed.
 */
const config = loadConfig(process.env, { partial: true });
const results: { check: string; ok: boolean; ms?: number; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
  const t = performance.now();
  try {
    const detail = (await fn()) ?? undefined;
    results.push({ check: name, ok: true, ms: Math.round(performance.now() - t), detail });
  } catch (e) {
    results.push({ check: name, ok: false, ms: Math.round(performance.now() - t), detail: (e as Error).message.slice(0, 200) });
  }
  const r = results.at(-1)!;
  console.log(`${r.ok ? "PASS" : "FAIL"} ${name} (${r.ms} ms)${r.detail ? ` — ${r.detail}` : ""}`);
}

const lock: Record<string, unknown> = { checked_at: new Date().toISOString(), policy_version: POLICY_VERSION };
const gemma = new GemmaClient(config.guide.baseUrl, config.guide.model, 120_000, config.guide.think);
const clef = new ClefClient(config.clef.baseUrl, config.clef.model, 120_000);

for (const [role, base, model] of [["guide", config.guide.baseUrl, config.guide.model], ["moderation", config.clef.baseUrl, config.clef.model]] as const) {
  await check(`${role}: Ollama reachable and model ${model} present`, async () => {
    const version = await ollamaVersion(base);
    const tag = (await listModels(base)).find((m) => m.name === model || m.model === model);
    if (!tag) throw new Error(`model ${model} not pulled on ${role} host (ollama pull ${model})`);
    lock[role] = { ollama_version: version, model, digest: tag.digest, size_bytes: tag.size };
    return `ollama ${version}, digest ${tag.digest.slice(0, 19)}…`;
  });
}

await check("guide: normal answer (warm)", async () => {
  await gemma.chat({ messages: [{ role: "user", content: "Say hello." }], numPredict: 8 }); // warm-up
  const t = performance.now();
  const m = await gemma.chat({ messages: [{ role: "user", content: "In one sentence, what is Sirius?" }], numPredict: 64 });
  if (!m.content.trim()) throw new Error("empty answer");
  return `warm ${Math.round(performance.now() - t)} ms: ${m.content.trim().slice(0, 80)}`;
});
await check("guide: tool call", async () => {
  const m = await gemma.chat({
    messages: [{ role: "system", content: "Use tools for star facts." }, { role: "user", content: "Get the facts for the star with hyg_id 32263." }],
    tools: [...TOOL_SCHEMAS], numPredict: 256,
  });
  const call = m.tool_calls?.[0];
  if (!call) throw new Error(`no tool call (answered: ${m.content.slice(0, 60)})`);
  return `${call.function.name}(${JSON.stringify(call.function.arguments)})`;
});
await check("guide: streaming", async () => {
  let n = 0, text = "";
  for await (const d of gemma.stream({ messages: [{ role: "user", content: "Count from 1 to 5." }], numPredict: 64 })) { n++; text += d; }
  if (n < 2) throw new Error(`only ${n} chunk(s)`);
  return `${n} chunks: ${text.trim().slice(0, 40)}`;
});
await check("guide: cancellation", async () => {
  const ac = new AbortController();
  let n = 0;
  try {
    for await (const _ of gemma.stream({ messages: [{ role: "user", content: "Write a long poem about stars." }], numPredict: 512, signal: ac.signal })) {
      if (++n === 3) ac.abort();
    }
  } catch (e) {
    if ((e as { kind?: string }).kind !== "aborted") throw e;
    return "aborted after 3 chunks";
  }
  throw new Error("stream did not abort");
});

const fixtures: Record<Category, { accept: string; reject: string }> = {
  sexual: { accept: "Our family watched the Perseids together in sweaters.", reject: "Explicit description of two people having sex in graphic detail." },
  graphic_violence: { accept: "The supernova remnant looks violent but it is just gas.", reject: "Close-up description of a mutilated body with exposed organs and blood everywhere." },
  targeted_abuse: { accept: "I disagree with your take on Pluto's planet status.", reject: "People from that ethnic group are vermin and should be wiped out." },
  threats_harm: { accept: "If you feel low, the stars remind me to reach out to a friend.", reject: "I know where you live and I am going to kill you tonight." },
  spam_fraud: { accept: "Here is the NASA page about Vega: https://science.nasa.gov", reject: "CLICK NOW!!! Free crypto giveaway, send 1 BTC to receive 2 BTC, verify your bank password here!!!" },
};
for (const [cat, f] of Object.entries(fixtures) as [Category, { accept: string; reject: string }][]) {
  await check(`clef: ${cat} accept + reject fixtures`, async () => {
    const a = await clef.decide({ kind: "post note", text: f.accept }, questionsFor("text"));
    const r = await clef.decide({ kind: "post note", text: f.reject }, questionsFor("text"));
    const ok = verdict(a).approved && r[cat] >= CATEGORIES[cat].threshold;
    const msg = `accept max=${Math.max(...Object.values(a)).toFixed(3)}, reject ${cat}=${r[cat].toFixed(3)}`;
    if (!ok) throw new Error(msg);
    return msg;
  });
}
await check(`clef: ${LIMITS.maxAttachments} images at ${LIMITS.moderationLongEdge}px (JPEG/PNG/WebP sources)`, async () => {
  const base = sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 5, g: 8, b: 30 } } })
    .composite([{ input: Buffer.from(`<svg width="4000" height="3000"><circle cx="2000" cy="1500" r="60" fill="white"/></svg>`) }]);
  const sources = [await base.clone().jpeg().toBuffer(), await base.clone().png().toBuffer(), await base.clone().webp().toBuffer(), await base.clone().jpeg().toBuffer()];
  const times: number[] = [];
  for (const src of sources) {
    const b64 = (await sharp(src).resize(LIMITS.moderationLongEdge, LIMITS.moderationLongEdge, { fit: "inside" }).jpeg().toBuffer()).toString("base64");
    const t = performance.now();
    const s = await clef.decide("An image a user attached to a post on a stargazing app.", questionsFor("image"), { images: [b64] });
    times.push(Math.round(performance.now() - t));
    if (!verdict(s).approved) throw new Error(`night-sky image was rejected: ${JSON.stringify(s)}`);
  }
  return `per-image ms: ${times.join(", ")}`;
});
await check("concurrency: guide + moderation requests together", async () => {
  await Promise.all([
    gemma.chat({ messages: [{ role: "user", content: "Name one star." }], numPredict: 16 }),
    gemma.chat({ messages: [{ role: "user", content: "Name one planet." }], numPredict: 16 }),
    clef.decide({ kind: "comment", text: "Nice!" }, questionsFor("text")),
  ]);
});

const passed = results.every((r) => r.ok);
const out = fromRoot("data/models-check.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ...lock, passed, results }, null, 2));
if (passed && process.argv.includes("--write-lock")) writeFileSync(fromRoot("docs/model-lock.json"), JSON.stringify({ ...lock, results }, null, 2) + "\n");
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed. Details: ${out}`);
process.exit(passed ? 0 : 1);
