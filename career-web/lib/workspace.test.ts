import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSchema, saveSchema, type Snapshot } from './workspace.ts';
import { readBody, AccountError, accountServer } from './account-server.ts';
import { GET, PUT, DELETE } from '../app/api/workspace/route.ts';
import { POST as accountPost } from '../app/api/account/route.ts';
import { GET as callback } from '../app/auth/callback/route.ts';

const initial: Snapshot = {
  form: { mode: 'draft', company: '', position: '', question: '', limit: 700, experience: '', job: '', draft: '', documents: [], previous: '', followup: '' },
  result: null, resultContext: { company: '', position: '', mode: 'draft', limit: 700 }, followup: '', step: 0,
};
const origin = 'https://career.test';
const owner = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
function request(method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`${origin}/api/workspace`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test('unfinished work can be saved; API keys, consent and owner fields cannot', () => {
  assert.equal(snapshotSchema.safeParse(initial).success, true);
  for (const field of ['apiKey', 'user_id', 'consent']) {
    assert.equal(snapshotSchema.safeParse({ ...initial, [field]: 'private' }).success, false);
    assert.equal(snapshotSchema.safeParse({ ...initial, form: { ...initial.form, [field]: 'private' } }).success, false);
  }
  assert.equal(saveSchema.safeParse({ snapshot: initial, expectedRevision: null }).success, true);
  assert.equal(saveSchema.safeParse({ snapshot: initial, expectedRevision: 'old' }).success, false);
  assert.equal(snapshotSchema.safeParse({ ...initial, step: 2 }).success, false);
});
test('stream byte limit applies without Content-Length, and malformed input is rejected', async () => {
  const oversized = request('PUT', { text: '가'.repeat(1200000) });
  await assert.rejects(readBody(oversized), (error: unknown) => error instanceof AccountError && error.status === 413);
  await assert.rejects(readBody(new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })), /읽을 수/);
});
test('cross-origin mutations are rejected before reaching the provider', async () => {
  for (const method of [PUT, DELETE]) {
    const response = await method(request('PUT', {}, { origin: 'https://attacker.test' }));
    assert.equal(response.status, 403);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
});
test('server response redacts unexpected provider failures', async () => {
  const response = accountServer(request('GET')).failure(new Error('SECRET TOKEN'));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET/);
});
test('authenticated routes validate identity, scope DB filters, and detect concurrent writes', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL; const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://testproject.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test';
  const jwt = ['e30', Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  const session = Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: owner } })).toString('base64url');
  const headers = { cookie: `sb-testproject-auth-token=base64-${session}`, 'x-workspace-user': owner };
  const calls: { url: string; method: string; body: string }[] = [];
  let databaseResult: unknown = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: owner, email: 'test@example.invalid', aud: 'authenticated' });
    calls.push({ url, method: init?.method || 'GET', body: String(init?.body || '') });
    return Response.json(databaseResult);
  }) as typeof fetch;
  try {
    assert.equal((await GET(request('GET'))).status, 401);
    assert.equal((await PUT(request('PUT', {}, { ...headers, 'x-workspace-user': 'other' }))).status, 409);
    assert.equal(calls.length, 0);
    assert.equal((await PUT(request('PUT', { snapshot: { ...initial, apiKey: 'private' }, expectedRevision: null }, headers))).status, 400);
    const revision = 'cccccccc-3333-4333-8333-cccccccccccc';
    const conflict = await PUT(request('PUT', { snapshot: initial, expectedRevision: revision }, headers));
    assert.equal(conflict.status, 409);
    assert.match(calls.at(-1)!.url, new RegExp(`user_id=eq.${owner}`));
    assert.match(calls.at(-1)!.url, new RegExp(`revision=eq.${revision}`));
    databaseResult = [{ revision, updated_at: new Date().toISOString() }];
    assert.equal((await PUT(request('PUT', { snapshot: initial, expectedRevision: null }, headers))).status, 200);
    assert.equal(calls.at(-1)!.method, 'POST');
    assert.equal(JSON.parse(calls.at(-1)!.body).user_id, owner);
    databaseResult = [];
    assert.equal((await DELETE(request('DELETE', { expectedRevision: revision }, headers))).status, 409);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test('OAuth uses PKCE, secure HttpOnly cookies, fixed callback destinations and safe errors', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL; const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://testproject.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test';
  const jwt = ['e30', Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.');
  let fail = false;
  globalThis.fetch = (async (input, init) => {
    assert.match(String(input), /auth\/v1\/token\?grant_type=pkce/);
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.auth_code, 'test-code'); assert.ok(sent.code_verifier);
    return fail ? Response.json({ error: 'invalid_grant', error_description: 'PRIVATE ERROR' }, { status: 400 }) : Response.json({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated' } });
  }) as typeof fetch;
  try {
    const start = await accountPost(request('POST', { action: 'login' }));
    assert.equal(start.status, 200);
    const provider = new URL((await start.json()).url);
    assert.equal(provider.searchParams.get('provider'), 'google');
    assert.equal(provider.searchParams.get('redirect_to'), `${origin}/auth/callback`);
    assert.equal(provider.searchParams.get('code_challenge_method'), 's256');
    const cookies = start.headers.getSetCookie();
    assert.ok(cookies.length);
    for (const cookie of cookies) { assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Lax/i); }
    const cookieHeader = cookies.map(value => value.split(';')[0]).join('; ');
    const response = await callback(new Request(`${origin}/auth/callback?code=test-code&next=https://attacker.test`, { headers: { cookie: cookieHeader } }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${origin}/?account=connected#workspace`);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.ok(response.headers.getSetCookie().some(value => value.includes('auth-token=') && /HttpOnly/i.test(value) && /Secure/i.test(value)));
    fail = true;
    const failed = await callback(new Request(`${origin}/auth/callback?code=test-code`, { headers: { cookie: cookieHeader } }));
    assert.equal(failed.headers.get('location'), `${origin}/?account=error#workspace`);
    assert.doesNotMatch(await failed.text(), /PRIVATE/);
    assert.match(failed.headers.get('cache-control')!, /no-store/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
