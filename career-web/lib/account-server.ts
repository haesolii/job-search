import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { MAX_REQUEST_BYTES } from './coach.ts';

export class AccountError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new AccountError(403, '이 사이트에서 다시 시도해주세요.');
}
export async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccountError(415, 'JSON 요청이 필요합니다.');
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, '요청 내용이 없습니다.');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new AccountError(413, '저장할 자료의 용량을 줄여주세요.'); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new AccountError(400, '요청 내용을 읽을 수 없습니다.'); }
  } finally { reader.releaseLock(); }
}

export function accountServer(request: Request) {
  const writes: string[] = [];
  function reply(body: unknown, status = 200, extra?: HeadersInit) {
    const headers = new Headers(extra);
    headers.set('Cache-Control', 'private, no-store'); headers.set('Vary', 'Cookie');
    for (const cookie of writes) headers.append('Set-Cookie', cookie);
    return Response.json(body, { status, headers });
  }
  function failure(error: unknown) {
    return reply({ error: error instanceof AccountError ? error.message : '연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }, error instanceof AccountError ? error.status : 503);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const client = url && key ? createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get('cookie') || '').map(({ name, value }) => ({ name, value: value || '' })),
      setAll: cookies => { for (const { name, value, options } of cookies) writes.push(serializeCookieHeader(name, value, options)); },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
  }) : null;
  async function user() {
    if (!client) throw new AccountError(503, '로그인 연결을 준비하고 있습니다. 비회원으로 이용할 수 있어요.');
    const { data, error } = await client.auth.getUser();
    if (error && ((error.status || 0) >= 500 || error.name === 'AuthRetryableFetchError')) throw new AccountError(503, '로그인 서버에 연결하지 못했습니다. 현재 입력은 유지됩니다.');
    if (error || !data.user) throw new AccountError(401, '로그인이 필요합니다.');
    return data.user;
  }
  return { client, user, reply, failure };
}
