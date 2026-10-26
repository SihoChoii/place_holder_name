import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MIGRATIONS_DIR, fingerprint, immediate, jobQueries, migrate, openDatabase } from "@stargaze/db";

test("migrations: fresh, repeat, reopen, changed file refused; constraints and rollback", () => {
  const dir = mkdtempSync(join(tmpdir(), "stargaze-db-"));
  try {
    const path = join(dir, "t.sqlite");
    let db = openDatabase(path);
    assert.deepEqual(migrate(db).applied, ["001_initial.sql"]);
    assert.deepEqual(migrate(db).applied, []);
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    db.close();
    db = openDatabase(path);
    assert.deepEqual(migrate(db).alreadyApplied, ["001_initial.sql"]);
    const migs = join(dir, "migs");
    cpSync(MIGRATIONS_DIR, migs, { recursive: true });
    appendFileSync(join(migs, "001_initial.sql"), "\n-- edited\n");
    assert.throws(() => migrate(db, migs), /changed after it was applied/);

    const u = randomUUID();
    db.prepare("INSERT INTO users VALUES (?, 'a@x.io', 'A', 'h', 1)").run(u);
    assert.throws(() => db.prepare("INSERT INTO star_claims VALUES (?, 1, ?, 1, 'k', 'f')").run(randomUUID(), randomUUID()), /FOREIGN KEY/);
    db.prepare("INSERT INTO star_claims VALUES (?, 1, ?, 1, 'k', 'f')").run(randomUUID(), u);
    assert.throws(() => db.prepare("INSERT INTO star_claims VALUES (?, 1, ?, 2, 'k2', 'f')").run(randomUUID(), u), /UNIQUE/);
    assert.throws(() => db.prepare("INSERT INTO reactions VALUES (?, ?, '💩', 1)").run(randomUUID(), u), /CHECK|FOREIGN/);
    // content + job in one transaction: a failure midway leaves neither
    const jobs = jobQueries(db);
    assert.throws(() => immediate(db, () => {
      jobs.enqueue("tag", "t1", 1);
      db.prepare("INSERT INTO tags (id, claim_id, hyg_id, user_id, created_at, request_key, request_fingerprint) VALUES ('t1', 'missing', 1, ?, 1, 'k', 'f')").run(u);
    }), /FOREIGN KEY/);
    assert.equal(jobs.listAll().length, 0);
    assert.equal(fingerprint({ b: 1, a: [2, 1] }), fingerprint({ a: [2, 1], b: 1 }));
    assert.notEqual(fingerprint({ a: [1, 2] }), fingerprint({ a: [2, 1] }));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
