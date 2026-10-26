import { immediate, jobQueries, migrate, openDatabase } from "@stargaze/db";
import { loadConfig } from "../config.js";

/**
 * Moderation operator commands (run while the API is up or down; the running loop picks up changes):
 *   pnpm moderation:list                 queued and failed jobs, oldest pending age
 *   pnpm moderation:retry <job-id|--all-failed>
 *   pnpm moderation:approve <tag-id> --reason "<audit reason>"   manual demo approval (audited; not real moderation)
 */
const config = loadConfig(process.env, { partial: true });
const db = openDatabase(config.dbPath);
migrate(db);
const jobs = jobQueries(db);
const [cmd, arg, ...rest] = process.argv.slice(2);
const now = Date.now();
if (cmd === "list") {
  const all = jobs.listAll();
  console.table(all.map((j) => ({ id: j.id, target: `${j.target_kind}:${j.target_id}`, attempts: j.attempts, failed: !!j.failed_at,
    next_attempt_in_s: j.failed_at ? null : Math.max(0, Math.round((j.next_attempt_at - now) / 1000)), last_error: j.last_error })));
  const s = jobs.stats();
  console.log(JSON.stringify({ queued: s.queued, failed: s.failed, oldest_pending_age_s: s.oldest_created_at ? Math.round((now - s.oldest_created_at) / 1000) : null }));
} else if (cmd === "retry") {
  const ids = arg === "--all-failed" ? jobs.listFailed().map((j) => j.id) : arg ? [arg] : [];
  if (!ids.length) { console.error("usage: moderation:retry <job-id|--all-failed>"); process.exit(2); }
  for (const id of ids) console.log(`${id}: ${jobs.retry(id, now) ? "requeued" : "not a failed job"}`);
} else if (cmd === "approve") {
  const reason = rest[0] === "--reason" ? rest.slice(1).join(" ").trim() : "";
  if (!arg || !reason) { console.error('usage: moderation:approve <tag-id> --reason "<why>"'); process.exit(2); }
  const result = JSON.stringify({ manual: true, reason, approved_by: "operator-cli", decided_at: now });
  const ok = immediate(db, () => {
    const n = db.prepare("UPDATE tags SET moderation_status = 'approved', moderation_result = ?, moderated_at = ? WHERE id = ? AND deleted_at IS NULL AND moderation_status = 'pending'")
      .run(result, now, arg).changes;
    if (n) {
      db.prepare("UPDATE media SET moderation_status = 'approved', moderation_result = ? WHERE tag_id = ?").run(result, arg);
      jobs.removeForTarget("tag", arg);
    }
    return n > 0;
  });
  console.log(ok ? `approved ${arg} manually (audited: ${reason})` : "no pending tag with that id");
} else {
  console.error("usage: moderation.js list | retry <job-id|--all-failed> | approve <tag-id> --reason <text>");
  process.exit(2);
}
db.close();
