import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { agentRoutes } from '../src/agent/index.js';
import { createFixtureBackend, createFixtureDb, fixtureAuth } from '../src/agent/evals/fixtures.js';

test('plugin uses the bounded Clef skill chooser for unmatched requests', async () => {
  const app = Fastify();
  const db = createFixtureDb();
  const backend = createFixtureBackend();
  const auth = fixtureAuth();
  let clefCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === 'http://clef.test/v1/systemone') {
      clefCalls++;
      const payload = JSON.parse(String(init?.body)) as {
        questions: { skill: { criteria: Record<string, string> } };
      };
      const probabilities = Object.fromEntries(
        Object.keys(payload.questions.skill.criteria).map((name) => [name, name === 'constellation_guide' ? 1 : 0]),
      );
      return Response.json({
        answers: { skill: { type: 'choice', choice: 'constellation_guide', probabilities } },
      });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'The sky is full of stars.' } }] });
  }) as typeof fetch;

  await app.register(agentRoutes, {
    db,
    backend,
    authenticate: auth.authenticate,
    getUserId: (request) => auth.getUserId(request),
    config: { guideBaseUrl: 'http://guide.test/v1', guideModel: 'guide', clefBaseUrl: 'http://clef.test' },
    fetch: fetchImpl,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/agent/chat',
      headers: { authorization: 'Bearer test-u1' },
      payload: {
        messages: [{ role: 'user', content: 'Tell me something unexpected.' }],
        context: { client: 'ios', mode: 'explore' },
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(clefCalls, 1);
    assert.match(response.body, /"skill":"constellation_guide"/);
  } finally {
    await app.close();
  }
});
