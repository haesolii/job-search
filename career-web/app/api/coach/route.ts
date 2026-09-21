import { createHash } from 'node:crypto';
import { buildParts, countText, inputSchema, MAX_REQUEST_BYTES, resultSchema, SYSTEM_INSTRUCTION, validateDocuments } from '../../../lib/coach.ts';

export const runtime = 'nodejs';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'no-store', 'Content-Language': 'ko' };
// Per-instance burst protection; Google enforces each visitor's project quota.
// For distributed traffic, also configure a Vercel Firewall rate-limit rule.
const requests = new Map<string, { count: number; until: number }>();

function error(message: string, status: number, extra = {}) {
  return Response.json({ error: message }, { status, headers: { ...headers, ...extra } });
}

async function readBounded(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('EMPTY');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error('LARGE'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) return error('이 사이트에서 다시 요청해주세요.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return error('올바른 요청 형식이 아닙니다.', 415);
  const apiKey = request.headers.get('x-gemini-key')?.trim() || '';
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(apiKey)) return error('Gemini API 키를 확인해주세요.', 401);
  const now = Date.now();
  for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const bucket = requests.get(keyHash) || { count: 0, until: now + 60000 };
  if (bucket.count >= 6 || requests.size >= 1000) return error('요청이 많습니다. 잠시 후 다시 시도해주세요.', 429, { 'Retry-After': '60' });
  bucket.count += 1;
  requests.set(keyHash, bucket);
  let raw: unknown;
  try { raw = await readBounded(request); }
  catch (cause) { return error(cause instanceof Error && cause.message === 'LARGE' ? '자료 용량이 큽니다. 첨부 파일을 줄여주세요.' : '입력 자료를 읽을 수 없습니다.', cause instanceof Error && cause.message === 'LARGE' ? 413 : 400); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return error(parsed.error.issues[0]?.message.startsWith('본인') || parsed.error.issues[0]?.message.startsWith('첨삭') ? parsed.error.issues[0].message : '필수 항목과 입력 길이를 확인해주세요.', 400);
  try { validateDocuments(parsed.data.documents); }
  catch (cause) { return error(cause instanceof Error ? cause.message : '첨부 파일을 확인해주세요.', 400); }

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(100000)]), cache: 'no-store',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: buildParts(parsed.data) }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 10000 },
      }),
    });
    if (!upstream.ok) {
      if ([400, 401, 403].includes(upstream.status)) return error('키 또는 자료를 확인해주세요. AI Studio에서 Gemini API 사용 권한을 확인하고, PDF가 암호화되어 있다면 해제한 뒤 다시 올려주세요.', 401);
      if (upstream.status === 429) return error('Gemini 사용 한도에 도달했습니다. AI Studio에서 할당량·결제를 확인하거나 잠시 후 다시 시도해주세요.', 429, { 'Retry-After': '60' });
      if (upstream.status === 404) return error('현재 Gemini 모델을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.', 503);
      return error('Gemini 연결이 원활하지 않습니다. 입력은 유지되니 잠시 후 다시 시도해주세요.', 502);
    }
    const data = await upstream.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') return error('답변이 끝까지 생성되지 않았습니다. 자료나 요청을 줄여 다시 시도해주세요.', 502);
    const text = candidate.content?.parts?.filter((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === 'string').map((part: { text: string }) => part.text).join('');
    const result = resultSchema.safeParse(JSON.parse(text || '{}'));
    if (!result.success) return error('답변 형식을 확인하지 못했습니다. 다시 생성해주세요.', 502);
    return Response.json({ result: result.data, counts: countText(result.data.body) }, { headers });
  } catch (cause) {
    if (request.signal.aborted) return error('요청을 취소했습니다.', 499);
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) return error('응답 시간이 길어 요청을 멈췄습니다. 자료를 줄여 다시 시도해주세요.', 504);
    return error('답변을 가져오지 못했습니다. 입력은 유지되니 다시 시도해주세요.', 502);
  }
}
