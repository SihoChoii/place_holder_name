import { randomBytes, randomUUID } from "node:crypto";
import { LIMITS } from "@stargaze/shared";
import { immediate, jobQueries, migrate, openDatabase } from "@stargaze/db";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/password.js";

/**
 * pnpm seed — repeatable demo records, clearly identified (emails demo.*@example.com, display names "Demo …").
 * Never resets data. Seeded posts are created PENDING with moderation jobs, so the real Clef loop reviews them;
 * seeding does not count as moderation evidence. New demo users get SEED_PASSWORD, or a random password printed
 * once; existing demo users keep the password they already have.
 */
const config = loadConfig(process.env, { partial: true });
const db = openDatabase(config.dbPath);
migrate(db);
const jobs = jobQueries(db);
const fromEnv = process.env.SEED_PASSWORD;
if (fromEnv !== undefined && (fromEnv.length < LIMITS.passwordMin || fromEnv.length > LIMITS.passwordMax)) {
  console.error(`SEED_PASSWORD must be ${LIMITS.passwordMin}-${LIMITS.passwordMax} characters.`);
  process.exit(1);
}
const password = fromEnv ?? randomBytes(15).toString("base64url");
const demo = [
  { email: "demo.ada@example.com", name: "Demo Ada", star: 32263, note: "Sirius sparkling low over the hills tonight" },
  { email: "demo.grace@example.com", name: "Demo Grace", star: 90979, note: "Vega straight overhead, summer triangle complete" },
  { email: "demo.carl@example.com", name: "Demo Carl", star: 27919, note: "Betelgeuse looking extra orange this evening" },
];
const hash = await hashPassword(password);
let created = 0, newUsers = 0;
for (const d of demo) {
  immediate(db, () => {
    let user = db.prepare("SELECT id FROM users WHERE email = ?").get(d.email) as { id: string } | undefined;
    const now = Date.now();
    if (!user) {
      user = { id: randomUUID() };
      db.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, d.email, d.name, hash, now);
      newUsers++;
    }
    const claim = db.prepare("SELECT id, user_id FROM star_claims WHERE hyg_id = ?").get(d.star) as { id: string; user_id: string } | undefined;
    if (claim && claim.user_id !== user.id) return; // someone real already owns it; leave it alone
    const claimId = claim?.id ?? randomUUID();
    if (!claim) db.prepare("INSERT INTO star_claims VALUES (?, ?, ?, ?, ?, ?)").run(claimId, d.star, user.id, now, `seed-claim-${d.star}`, "seed");
    if (db.prepare("SELECT 1 FROM tags WHERE user_id = ? AND request_key = ?").get(user.id, `seed-tag-${d.star}`)) return;
    const tagId = randomUUID();
    db.prepare("INSERT INTO tags (id, claim_id, hyg_id, user_id, note, created_at, request_key, request_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, 'seed')")
      .run(tagId, claimId, d.star, user.id, d.note, now, `seed-tag-${d.star}`);
    jobs.enqueue("tag", tagId, now);
    created++;
  });
}
db.close();
console.log(JSON.stringify({
  seeded_posts: created, users: demo.map((d) => d.email), new_users: newUsers,
  // Shown only when this run generated it for newly created users; it is not stored anywhere else.
  ...(fromEnv === undefined && newUsers > 0 ? { generated_password: password } : {}),
  note: "posts are pending until real moderation runs",
}));
