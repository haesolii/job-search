import { AccountError, accountServer, readBody, sameOrigin } from '../../../lib/account-server.ts';
import { deleteSchema, saveSchema, snapshotSchema } from '../../../lib/workspace.ts';
import { validateDocuments } from '../../../lib/coach.ts';

export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const server = accountServer(request);
  try {
    if (request.method !== 'GET') sameOrigin(request);
    const user = await server.user();
    if (request.headers.get('x-workspace-user') !== user.id) return server.reply({ error: '계정이 변경되었습니다. 페이지를 새로 열어주세요.', accountChanged: true }, 409);
    const db = server.client!.from('career_workspaces');
    if (request.method === 'GET') {
      const { data, error } = await db.select('snapshot,revision,updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw new Error('database');
      if (data) {
        const checked = snapshotSchema.safeParse(data.snapshot);
        if (!checked.success) throw new AccountError(422, '저장 자료 형식을 읽을 수 없습니다.');
        validateDocuments(checked.data.form.documents);
        data.snapshot = checked.data;
      }
      return server.reply({ workspace: data });
    }
    const body = await readBody(request);
    if (request.method === 'DELETE') {
      const parsed = deleteSchema.safeParse(body);
      if (!parsed.success) throw new AccountError(400, '삭제할 저장본을 먼저 확인해주세요.');
      const { data, error } = await db.delete().eq('user_id', user.id).eq('revision', parsed.data.expectedRevision).select('revision');
      if (error) throw new Error('database');
      if (!data?.length) throw new AccountError(409, '다른 창에서 저장본이 변경되었습니다. 다시 불러온 뒤 시도해주세요.');
      return server.reply({ ok: true });
    }
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) throw new AccountError(400, '저장할 내용의 형식이나 분량을 확인해주세요.');
    try { validateDocuments(parsed.data.snapshot.form.documents); }
    catch { throw new AccountError(400, '첨부 파일의 형식과 전체 2MB 용량 제한을 확인해주세요.'); }
    const values = { snapshot: parsed.data.snapshot, revision: crypto.randomUUID(), updated_at: new Date().toISOString() };
    const query = parsed.data.expectedRevision === null
      ? db.insert({ ...values, user_id: user.id })
      : db.update(values).eq('user_id', user.id).eq('revision', parsed.data.expectedRevision);
    const { data, error } = await query.select('revision,updated_at');
    if (error?.code === '23505' || (!error && !data?.length)) throw new AccountError(409, '다른 저장본이 있습니다. 먼저 불러와 확인해주세요. 현재 입력은 유지됩니다.');
    if (error) throw new Error('database');
    return server.reply(data![0]);
  } catch (error) { return server.failure(error); }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
