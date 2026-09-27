import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, PUT } from '../app/api/applications/route.ts';
import { emptyDetails, type ApplicationRecord } from './applications.ts';

test('application API enforces account, owner, CAS and server-only status history', async () => {
  const oldFetch = globalThis.fetch, oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://testproject.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test';
  const owner = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', revision = 'cccccccc-1111-4111-8111-cccccccccccc';
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const jwt = ['e30', Buffer.from(JSON.stringify({ sub: owner, exp: expiry })).toString('base64url'), 'test'].join('.');
  const session = Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'test', expires_at: expiry, user: { id: owner } })).toString('base64url');
  const headers = { origin: 'https://career.test', 'content-type': 'application/json', cookie: `sb-testproject-auth-token=base64-${session}`, 'x-workspace-user': owner };
  const initial: ApplicationRecord = { id, revision, details: { ...emptyDetails, company: 'Test' }, history: [{ status: 'interested', at: '2026-09-01T00:00:00Z' }], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  let conflict = false;
  globalThis.fetch = (async (input, init) => {
    const url = String(input), method = init?.method || 'GET', body = JSON.parse(String(init?.body || '{}'));
    if (url.includes('/auth/v1/user')) return Response.json({ id: owner, aud: 'authenticated' });
    calls.push({ url, method, body });
    if (method === 'GET') return Response.json(url.includes('revision=') ? [initial] : [initial]);
    return Response.json(conflict ? [] : [{ ...initial, ...body }]);
  }) as typeof fetch;
  const request = (body: unknown, extra = {}) => new Request('https://career.test/api/applications', { method: 'PUT', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  const payload = { id, expectedRevision: revision, details: { ...initial.details, status: 'interview' } };
  try {
    assert.equal((await GET(new Request('https://career.test/api/applications'))).status, 401);
    assert.equal((await PUT(request(payload, { origin: 'https://evil.test' }))).status, 403);
    assert.equal((await PUT(request(payload, { 'x-workspace-user': 'other' }))).status, 409);
    assert.equal(calls.length, 0);
    assert.equal((await PUT(request({ ...payload, history: [] }))).status, 400);
    const response = await PUT(request(payload));
    assert.equal(response.status, 200);
    const saved = (await response.json()).record;
    assert.deepEqual(saved.history[0], initial.history[0]);
    assert.equal(saved.history[1].status, 'interview');
    assert.notEqual(saved.revision, revision);
    const write = calls.at(-1)!;
    for (const scope of [`user_id=eq.${owner}`, `id=eq.${id}`, `revision=eq.${revision}`]) assert.ok(write.url.includes(scope));
    conflict = true;
    assert.equal((await PUT(request(payload))).status, 409);
    conflict = false;
    const sameStatus = await PUT(request({ ...payload, details: initial.details }));
    assert.equal((await sameStatus.json()).record.history.length, 1);
    const list = await GET(new Request('https://career.test/api/applications?page=0', { headers }));
    assert.equal(list.status, 200); assert.match(list.headers.get('cache-control')!, /no-store/);
    assert.ok(calls.at(-1)!.url.includes(`user_id=eq.${owner}`));
    assert.equal((await GET(new Request('https://career.test/api/applications?page=-1', { headers }))).status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
