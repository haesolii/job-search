import { AccountError, accountServer, readBody, sameOrigin } from '../../../lib/account-server.ts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const server = accountServer(request);
  try {
    if (!server.client) return server.reply({ user: null, configured: false });
    const user = await server.user();
    return server.reply({ user: { id: user.id, email: user.email }, configured: true });
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) return server.reply({ user: null, configured: true });
    return server.failure(error);
  }
}
export async function POST(request: Request) {
  const server = accountServer(request);
  try {
    sameOrigin(request);
    const parsed = z.object({ action: z.enum(['login', 'logout']) }).strict().safeParse(await readBody(request));
    if (!parsed.success) throw new AccountError(400, '요청을 확인해주세요.');
    if (!server.client) throw new AccountError(503, '로그인 연결을 준비하고 있습니다.');
    if (parsed.data.action === 'logout') {
      const { error } = await server.client.auth.signOut({ scope: 'local' });
      if (error) throw new AccountError(503, '로그아웃하지 못했습니다. 다시 시도해주세요.');
      return server.reply({ ok: true });
    }
    const { data, error } = await server.client.auth.signInWithOAuth({ provider: 'google', options: {
      redirectTo: `${new URL(request.url).origin}/auth/callback`, skipBrowserRedirect: true,
    } });
    if (error || !data.url) throw new AccountError(503, 'Google 로그인에 연결하지 못했습니다.');
    return server.reply({ url: data.url });
  } catch (error) { return server.failure(error); }
}
