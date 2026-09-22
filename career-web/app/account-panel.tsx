'use client';

import { useEffect, useRef, useState } from 'react';
import { snapshotSchema, type Snapshot } from '../lib/workspace';

type User = { id: string; email?: string };
export default function AccountPanel({ snapshot, restore, clear, busy, onBusy }: {
  snapshot: () => Snapshot; restore: (value: Snapshot) => void; clear: () => void; busy: boolean; onBusy: (value: boolean) => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [configured, setConfigured] = useState(false);
  const [pending, setPending] = useState(true);
  const [revision, setRevision] = useState<string | null>(null);
  const [message, setMessage] = useState('로그인 상태를 확인하고 있어요.');
  const [failed, setFailed] = useState(false);
  const identity = useRef<string | null | undefined>(undefined);
  const inFlight = useRef(false);
  const clearRef = useRef(clear); clearRef.current = clear;
  const busyRef = useRef(busy); busyRef.current = busy;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { if (!busy) void refreshRef.current(); }, [busy]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (!active || busyRef.current || inFlight.current) return;
      inFlight.current = true;
      try {
        const response = await fetch('/api/account', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!active) return;
        const next = data.user?.id || null;
        if (identity.current !== undefined && identity.current !== next) {
          clearRef.current(); setRevision(null); setMessage('계정이 변경되어 화면의 자료를 지웠어요. 저장본을 불러와주세요.');
        } else if (identity.current === undefined) {
          setMessage(new URLSearchParams(location.search).get('account') === 'error' ? '로그인하지 못했어요. 다시 시도해주세요.' : next ? '저장본을 불러오거나 새 작업을 시작하세요.' : '로그인하면 이력서와 작업 결과를 다음에도 사용할 수 있어요.');
        }
        identity.current = next; setUser(data.user); setConfigured(data.configured);
      } catch { if (active) { setFailed(true); setMessage('로그인 상태를 확인하지 못했어요. 새로고침 후 다시 시도해주세요.'); } }
      finally { if (active) { inFlight.current = false; setPending(false); } }
    }
    refreshRef.current = refresh;
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; inFlight.current = false; refreshRef.current = async () => {}; window.removeEventListener('focus', refresh); };
  }, []);

  async function action(kind: 'login' | 'logout' | 'save' | 'load' | 'delete') {
    if (pending || busy || inFlight.current) return;
    if (kind === 'login' && !window.confirm('Google 로그인 화면으로 이동합니다. 현재 입력은 사라지므로 필요한 내용은 먼저 내려받아 주세요. 계속할까요?')) return;
    if (kind === 'logout' && !window.confirm('로그아웃하면 화면의 자료와 API 키를 지웁니다. 저장하지 않은 변경은 사라져요. 계속할까요?')) return;
    if (kind === 'load' && !window.confirm('저장본으로 현재 입력을 바꿀까요? 저장하지 않은 변경은 사라집니다.')) return;
    if (kind === 'delete' && !window.confirm('서버의 저장본을 영구 삭제할까요? 현재 화면의 입력은 유지됩니다.')) return;
    inFlight.current = true; setPending(true); onBusy(true); setFailed(false);
    try {
      const accountAction = kind === 'login' || kind === 'logout';
      const response = await fetch(accountAction ? '/api/account' : '/api/workspace', {
        method: accountAction ? 'POST' : kind === 'save' ? 'PUT' : kind === 'delete' ? 'DELETE' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', ...(user ? { 'x-workspace-user': user.id } : {}) },
        body: accountAction ? JSON.stringify({ action: kind }) : kind === 'save' ? JSON.stringify({ snapshot: snapshot(), expectedRevision: revision }) : kind === 'delete' ? JSON.stringify({ expectedRevision: revision }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || data.accountChanged) { clearRef.current(); setUser(null); identity.current = null; setRevision(null); }
        throw new Error(data.error || '요청을 처리하지 못했어요.');
      }
      if (kind === 'login') { location.assign(data.url); return; }
      if (kind === 'logout') { clearRef.current(); setUser(null); identity.current = null; setRevision(null); setMessage('로그아웃했어요. 저장본은 계정에 보관됩니다.'); }
      if (kind === 'save') { setRevision(data.revision); setMessage('현재 자료와 결과를 계정에 저장했어요. 이후 변경은 다시 저장해주세요.'); }
      if (kind === 'delete') { setRevision(null); setMessage('서버의 저장본을 삭제했어요. 화면의 입력은 그대로예요.'); }
      if (kind === 'load') {
        if (data.workspace) { restore(snapshotSchema.parse(data.workspace.snapshot)); setRevision(data.workspace.revision); setMessage('저장본을 불러왔어요. API 키와 전송 동의는 다시 입력해주세요.'); }
        else { setRevision(null); setMessage('아직 저장본이 없어요. 현재 작업을 저장해보세요.'); }
      }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '연결하지 못했어요. 다시 시도해주세요.'); }
    finally { inFlight.current = false; setPending(false); onBusy(false); if (kind !== 'login') void refreshRef.current(); }
  }

  return <section className="account-panel" aria-label="계정과 개인 저장">
    <div><p className="small-title">{user ? 'MY SAVED WORK' : 'KEEP YOUR PROGRESS'}</p><h3>{user ? user.email || '내 계정' : '다음에도, 여기서 이어서'}</h3>
      <p role={failed ? 'alert' : 'status'}>{message}</p></div>
    <div className="account-actions">
      {user ? <><button disabled={pending || busy} onClick={() => action('save')}>현재 작업 저장</button><button disabled={pending || busy} onClick={() => action('load')}>저장본 불러오기</button><button disabled={pending || busy || !revision} onClick={() => action('delete')}>저장본 삭제</button><button disabled={pending || busy} onClick={() => action('logout')}>로그아웃</button></> : <button disabled={pending || busy || !configured} onClick={() => action('login')}>{pending ? '확인 중…' : configured ? 'Google로 로그인' : '로그인 연결 준비 중'}</button>}
    </div>
    <p className="account-privacy">저장 버튼을 누르면 이력서·입력·결과를 내 계정에 보관합니다. API 키는 저장하지 않습니다. 비회원으로도 작성할 수 있어요.</p>
  </section>;
}
