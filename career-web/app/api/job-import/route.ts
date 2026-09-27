import { createHash } from 'node:crypto';
import { importPrompt, jobImportInput, parseImportedJob, publicJobUrl, readImportJson } from '../../../lib/job-import.ts';

export const runtime = 'nodejs';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'no-store', 'Content-Language': 'ko' };
// ponytail: per-instance burst guard; provider project quotas remain authoritative.
const requests = new Map<string, { count: number; until: number }>();
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return error('이 사이트에서 다시 시도해주세요.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return error('JSON 요청이 필요합니다.', 415);
  const apiKey = request.headers.get('x-gemini-key')?.trim() || '';
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(apiKey)) return error('자료 작성 화면에서 Gemini API 키를 먼저 입력해주세요.', 401);
  let input;
  try { input = jobImportInput.safeParse(await readImportJson(request, 8192)); }
  catch (cause) { return error('링크 요청을 읽지 못했습니다. 공개 채용공고 주소 하나를 입력해주세요.', cause instanceof Error && cause.message === 'LARGE' ? 413 : 400); }
  if (!input.success) return error('동의 여부와 공개 채용공고 링크를 확인해주세요. 로그인·내부망 주소는 사용할 수 없습니다.', 400);
  const sourceUrl = publicJobUrl(input.data.url)!;
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const bucket = requests.get(hash) || { count: 0, until: now + 60000 };
  if (bucket.count >= 6 || requests.size >= 1000) return error('링크 요청이 많습니다. 1분 후 다시 시도해주세요.', 429);
  bucket.count++; requests.set(hash, bucket);
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(importPrompt(sourceUrl)), cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(100000)]),
    });
    if (!upstream.ok) {
      if ([401, 403].includes(upstream.status)) return error('Gemini API 키와 사용 권한을 확인해주세요.', 401);
      if (upstream.status === 429) return error('Gemini 사용 한도에 도달했습니다. 할당량을 확인하거나 잠시 후 다시 시도해주세요.', 429);
      return error('Gemini에서 공고를 읽지 못했습니다. 공고 내용을 직접 붙여넣거나 파일로 올려주세요.', 502);
    }
    const result = parseImportedJob(await readImportJson(upstream, 256000), sourceUrl);
    return Response.json({ result, sourceUrl }, { headers });
  } catch (cause) {
    if (request.signal.aborted) return error('링크 읽기를 취소했습니다.', 499);
    if (cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name)) return error('링크 읽기 시간이 초과되었습니다. 공고 내용을 직접 붙여넣어주세요.', 504);
    return error('공고의 내용을 확인하지 못했습니다. 로그인이나 접근 제한이 있는 페이지는 공고 내용을 직접 붙여넣거나 파일로 올려주세요.', 502);
  }
}
