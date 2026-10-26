import { acquireProcessLock } from "../../src/lib/lock.js";

let release: (() => void) | undefined;
process.on("message", (message) => {
  if (message === "acquire") {
    try { release = acquireProcessLock(process.argv[2]); process.send?.({ acquired: true, pid: process.pid }); }
    catch (e) { process.send?.({ acquired: false, error: (e as Error).message }); }
  }
  if (message === "exit") { release?.(); process.exit(0); }
});
process.send?.("ready");
