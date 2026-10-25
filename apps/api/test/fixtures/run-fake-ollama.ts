/** TEST FIXTURE ONLY: run the fake Ollama server standalone (for `pnpm smoke` rehearsals without model hosts). */
import { startFakeOllama } from "./fake-ollama.js";
const fake = await startFakeOllama(Number(process.env.FAKE_OLLAMA_PORT ?? 11999));
console.log(`FAKE (test-only) Ollama listening at ${fake.url}`);
