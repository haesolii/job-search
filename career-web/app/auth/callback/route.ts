import { accountServer } from '../../../lib/account-server.ts';

export async function GET(request: Request) {
  const server = accountServer(request);
  let success = false;
  try {
    const code = new URL(request.url).searchParams.get('code');
    if (code && server.client) success = !(await server.client.auth.exchangeCodeForSession(code)).error;
  } catch { /* The fixed redirect contains no provider errors or tokens. */ }
  const response = server.reply(null, 303, { Location: `${new URL(request.url).origin}/?account=${success ? 'connected' : 'error'}#workspace` });
  return response;
}
