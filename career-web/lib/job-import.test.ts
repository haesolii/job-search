import test from 'node:test';
import assert from 'node:assert/strict';
import { importedJobSchema, jobImportInput, parseImportedJob, publicJobUrl } from './job-import.ts';
import { POST } from '../app/api/job-import/route.ts';

const url = 'https://careers.example.com/jobs/123';
const result = { company: '테스트 회사', position: '개발자', job: '채용 업무와 요건', question: '', deadline: '2028-02-29' };
function response(status = 'success', fetched = url) { return { status: 'completed', steps: [{ type: 'url_context_result', result: [{ status, url: fetched }] }, { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(result) }] }] }; }
let sequence = 0;
function request(body: unknown = { url, consent: true }, origin = 'https://career.test') { return new Request('https://career.test/api/job-import', { method: 'POST', headers: { origin, 'Content-Type': 'application/json', 'x-gemini-key': `test_key_not_real_${String(++sequence).padStart(8, '0')}` }, body: JSON.stringify(body) }); }

test('only public domain HTTP URLs without credentials and ports are accepted', () => {
  for (const value of ['http://localhost', 'http://x.local', 'http://x.internal', 'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://10.2.3.4', 'https://user:pass@careers.example.com', 'file:///etc/passwd', 'https://careers.example.com:8080']) assert.equal(publicJobUrl(value), null, value);
  assert.equal(publicJobUrl(`${url}#section`), url);
  assert.equal(jobImportInput.safeParse({ url, consent: true, apiKey: 'secret' }).success, false);
  assert.equal(jobImportInput.safeParse({ url, consent: false }).success, false);
});
test('missing, unsafe, mismatched or failed retrieval never returns invented content', () => {
  for (const status of ['unsafe', 'error', 'paywall', '']) assert.throws(() => parseImportedJob(response(status), url));
  assert.throws(() => parseImportedJob(response('success', 'https://other.example.com/'), url));
  assert.throws(() => parseImportedJob({ ...response(), status: 'incomplete' }, url));
  assert.throws(() => parseImportedJob({ status: 'completed', steps: response().steps.slice(1) }, url));
  assert.deepEqual(parseImportedJob(response(), url), result);
  assert.deepEqual(parseImportedJob({ ...response(), steps: [{ type: 'model_output', content: [{ type: 'text', text: '공고를 확인하겠습니다.' }] }, ...response().steps] }, url), result);
});
test('returned fields and deadline are strict, bounded and real dates', () => {
  for (const deadline of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-00', '9/22']) assert.equal(importedJobSchema.safeParse({ ...result, deadline }).success, false);
  assert.equal(importedJobSchema.safeParse({ ...result, deadline: '' }).success, true);
  assert.equal(importedJobSchema.safeParse({ ...result, job: '', extra: true }).success, false);
});
test('route uses only Google, sends header key and no persisted interaction, bounds body and hides upstream errors', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.match(new Headers(init?.headers).get('x-goog-api-key') || '', /^test_key_not_real_/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.tools[0].type, 'url_context');
    assert.equal(String(init?.body).includes('test_key_not_real_'), false);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return Response.json(response());
  };
  try {
    assert.equal((await POST(request({}, 'https://evil.test'))).status, 403);
    assert.equal((await POST(request({ url: 'http://localhost', consent: true }))).status, 400);
    assert.equal((await POST(request({ url: 'x'.repeat(9000), consent: true }))).status, 413);
    assert.equal(calls, 0);
    const ok = await POST(request()); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ok.json(), { result, sourceUrl: url });
    globalThis.fetch = async () => Response.json(response('paywall'));
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => new Response('sensitive provider error', { status: 500 });
    const failure = await POST(request()); assert.equal(failure.status, 502); assert.equal((await failure.text()).includes('sensitive'), false);
  } finally { globalThis.fetch = original; }
});
