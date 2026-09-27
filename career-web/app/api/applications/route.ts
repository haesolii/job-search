import { AccountError, accountServer, readBody, sameOrigin } from '../../../lib/account-server.ts';
import { recordSchema, saveApplicationSchema } from '../../../lib/applications.ts';

export const dynamic = 'force-dynamic';
const columns = 'id,details,history,revision,created_at,updated_at';
const conflict = () => new AccountError(409, '다른 창에서 지원 기록이 변경되었습니다. 입력 내용을 복사한 뒤 다시 불러와주세요.');
async function handle(request: Request) {
  const server = accountServer(request);
  try {
    if (request.method !== 'GET') sameOrigin(request);
    const user = await server.user();
    if (request.headers.get('x-workspace-user') !== user.id) return server.reply({ error: '계정이 변경되었습니다. 페이지를 새로 열어주세요.', accountChanged: true }, 409);
    const db = server.client!.from('career_applications');
    if (request.method === 'GET') {
      const pageText = new URL(request.url).searchParams.get('page') ?? '0';
      if (!/^\d{1,5}$/.test(pageText)) throw new AccountError(400, '페이지 번호를 확인해주세요.');
      const page = Number(pageText);
      // Creation order remains stable while records are edited or archived.
      const { data, error } = await db.select(columns).eq('user_id', user.id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(page * 50, page * 50 + 50);
      if (error) throw new Error('database');
      return server.reply({ records: (data ?? []).slice(0, 50).map(row => recordSchema.parse(row)), hasMore: (data?.length ?? 0) > 50 });
    }
    const parsed = saveApplicationSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new AccountError(400, '회사명, 날짜 또는 입력 분량을 확인해주세요.');
    const { id, expectedRevision, details } = parsed.data;
    const now = new Date().toISOString();
    let history = [{ status: details.status, at: now }];
    if (expectedRevision !== null) {
      const { data, error } = await db.select(columns).eq('user_id', user.id).eq('id', id).eq('revision', expectedRevision).maybeSingle();
      if (error) throw new Error('database');
      if (!data) throw conflict();
      const existing = recordSchema.parse(data);
      history = existing.history;
      if (existing.details.status !== details.status) {
        if (history.length >= 1000) throw new AccountError(422, '상태 변경 기록이 최대 개수에 도달했습니다. 새 지원 기록을 만들어주세요.');
        history = [...history, { status: details.status, at: now }];
      }
    }
    const values = { details, history, revision: crypto.randomUUID(), updated_at: now };
    const query = expectedRevision === null
      ? db.insert({ ...values, id, user_id: user.id })
      : db.update(values).eq('user_id', user.id).eq('id', id).eq('revision', expectedRevision);
    const { data, error } = await query.select(columns).maybeSingle();
    if (error?.code === '23505' || (!error && !data)) throw conflict();
    if (error) throw new Error('database');
    return server.reply({ record: recordSchema.parse(data) });
  } catch (error) { return server.failure(error); }
}
export const GET = handle;
export const PUT = handle;
