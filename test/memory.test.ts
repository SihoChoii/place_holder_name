import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';

import { SchemaError, applySchema } from '../src/agent/memory/db.js';
import { SessionStore } from '../src/agent/memory/sessions.js';

function createDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  db.prepare('INSERT INTO users (id) VALUES (?)').run('user-1');
  return db;
}

test('migrates message provenance and excludes unknown local history', () => {
  const db = createDatabase();
  db.exec(`
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      scope TEXT NOT NULL,
      summary TEXT,
      turns INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE (user_id, scope)
    );
    CREATE TABLE agent_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.prepare('INSERT INTO agent_sessions (id, user_id, scope, turns, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('old-session', 'user-1', 'local', 1, 1);
  db.prepare('INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('old-user', 'old-session', 'user', 'old question', 1);
  db.prepare('INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('old-assistant', 'old-session', 'assistant', 'old answer', 2);

  applySchema(db);
  const columns = db.prepare("SELECT name FROM pragma_table_info('agent_messages')").pluck().all();
  assert.ok(columns.includes('referenced_hyg_ids'));

  const store = new SessionStore(db, () => 1_000);
  assert.deepEqual(store.load('user-1', 'local', { mode: 'local', inView: new Set() }).turns, []);

  store.save('user-1', 'local', {
    user: 'new question',
    assistant: 'new answer',
    refs: [],
    topic: 'question',
    speedC: 0.9,
  });
  assert.deepEqual(store.load('user-1', 'local', { mode: 'local', inView: new Set() }).turns, [
    { user: 'new question', assistant: 'new answer' },
  ]);
});

test('retains local history while all referenced stars remain visible', () => {
  const db = createDatabase();
  applySchema(db);
  const store = new SessionStore(db, () => 1_000);
  store.save('user-1', 'local', {
    user: 'tell me about Vega',
    assistant: 'Vega is bright',
    refs: [91262],
    topic: 'star question',
    starName: 'Vega',
    speedC: 0.9,
  });

  assert.equal(
    store.load('user-1', 'local', { mode: 'local', inView: new Set([91262, 1]) }).turns.length,
    1,
  );
  assert.equal(
    store.load('user-1', 'local', { mode: 'local', inView: new Set([1]) }).turns.length,
    0,
  );
});

test('rejects incompatible existing harness tables', () => {
  const db = createDatabase();
  db.exec('CREATE TABLE agent_sessions (id TEXT PRIMARY KEY)');
  assert.throws(() => applySchema(db), (error: unknown) => (
    error instanceof SchemaError
      && error.message.includes('agent_sessions')
      && error.message.includes('user_id')
  ));
});

test('keeps fifty session messages and twenty recent stars', () => {
  const db = createDatabase();
  applySchema(db);
  let now = 0;
  const store = new SessionStore(db, () => ++now);

  for (let index = 0; index < 30; index += 1) {
    store.save('user-1', 'explore', {
      user: `question ${index}`,
      assistant: `answer ${index}`,
      refs: [],
      topic: 'explore',
      speedC: 0.9,
    });
  }
  const messageCount = db.prepare('SELECT COUNT(*) FROM agent_messages').pluck().get();
  assert.equal(messageCount, 50);

  for (let hygId = 1; hygId <= 25; hygId += 1) {
    store.recordRecentStar('user-1', hygId);
  }
  assert.deepEqual(store.recentStars('user-1', 30), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
});
