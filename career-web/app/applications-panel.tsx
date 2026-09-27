'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, ArrowUpRight, Archive, X, Link2 } from 'lucide-react';
import { detailsSchema, emptyDetails, eventLabels, recordSchema, statusLabels, type ApplicationDetails, type ApplicationRecord } from '../lib/applications';
import { importedJobSchema } from '../lib/job-import';
import { koreaToday } from '../lib/calendar';
import ApplicationCalendar from './application-calendar';

export default function ApplicationsPanel({ userId, apiKey, busy, onBusy, onChoose, currentAnswer }: {
  userId: string | null; apiKey: string; busy: boolean; onBusy: (busy: boolean) => void;
  onChoose: (details: ApplicationDetails) => void; currentAnswer: { company: string; position: string; body: string };
}) {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [selected, setSelected] = useState<ApplicationRecord | null>(null);
  const [details, setDetails] = useState<ApplicationDetails>({ ...emptyDetails });
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [linkConsent, setLinkConsent] = useState(false);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const newId = useRef<string | null>(null);
  const dirty = editing && JSON.stringify(details) !== JSON.stringify(selected?.details || emptyDetails);
  const locked = pending || busy;
  const update = <K extends keyof ApplicationDetails>(key: K, value: ApplicationDetails[K]) => setDetails(current => ({ ...current, [key]: value }));
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function request(url: string, init?: RequestInit) {
    const controller = new AbortController(); active.current = controller;
    const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(url.includes('job-import') ? 110000 : 30000)]), headers: { 'Content-Type': 'application/json', 'x-workspace-user': userId || '', ...init?.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했어요.');
    if (!alive.current || controller.signal.aborted) throw new Error('요청이 취소됐어요.');
    return data;
  }
  function canLeave() { return !dirty || window.confirm('지원 기록의 저장하지 않은 변경을 버릴까요? 필요한 내용은 먼저 저장해주세요.'); }
  async function load() {
    if (locked || !userId || !canLeave()) return;
    setPending(true); onBusy(true); setError('');
    try {
      const all: ApplicationRecord[] = [];
      for (let page = 0; ; page++) {
        const data = await request(`/api/applications?page=${page}`);
        all.push(...data.records.map((item: unknown) => recordSchema.parse(item)));
        if (!data.hasMore) break;
        if (page >= 99) throw new Error('기록이 5,000개를 넘습니다. 지원팀에 문의해주세요.');
      }
      setRecords(all); setLoaded(true); setSelected(null); setEditing(false); setDetails({ ...emptyDetails }); setMessage('저장된 지원 기록을 불러왔어요.');
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '기록을 불러오지 못했어요.'); }
    finally { if (alive.current) { setPending(false); onBusy(false); } }
  }
  function choose(record: ApplicationRecord | null) {
    if (locked || !canLeave()) return;
    setSelected(record); setDetails(record?.details || { ...emptyDetails }); newId.current = crypto.randomUUID(); setEditing(true); setError(''); setMessage(''); setLinkConsent(false);
    requestAnimationFrame(() => document.getElementById('application-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  async function save(next = details) {
    if (locked || !userId) return;
    const parsed = detailsSchema.safeParse(next);
    if (!parsed.success) { setError('회사명, 날짜와 입력 분량을 확인해주세요. 일정마다 날짜가 필요해요.'); return; }
    setPending(true); onBusy(true); setError('');
    try {
      newId.current ||= crypto.randomUUID();
      const data = await request('/api/applications', { method: 'PUT', body: JSON.stringify({ id: selected?.id || newId.current, expectedRevision: selected?.revision || null, details: parsed.data }) });
      const record = recordSchema.parse(data.record);
      setRecords(current => [...current.filter(item => item.id !== record.id), record]); setSelected(record); setDetails(record.details); setMessage('지원 기록과 일정을 저장했어요.');
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '저장하지 못했어요. 입력은 유지됩니다.'); }
    finally { if (alive.current) { setPending(false); onBusy(false); } }
  }
  async function importLink() {
    if (locked) return;
    if (!apiKey.trim()) { setError('아래 작업실에서 Gemini API 키를 먼저 입력해주세요.'); document.getElementById('api-key')?.focus(); return; }
    if (!linkConsent) { setError('공고 링크를 Google로 보내는 안내에 동의해주세요.'); return; }
    if ((details.company || details.job) && !window.confirm('링크에서 읽은 회사·직무·공고·문항으로 현재 입력을 바꿀까요?')) return;
    setPending(true); onBusy(true); setError(''); setMessage('공고를 읽고 있어요. 잠시 기다려주세요.');
    try {
      const data = await request('/api/job-import', { method: 'POST', headers: { 'x-gemini-key': apiKey.trim() }, body: JSON.stringify({ url: details.sourceUrl, consent: true }) });
      const result = importedJobSchema.parse(data.result);
      setDetails(current => ({ ...current, company: result.company, position: result.position, job: result.job, question: result.question, sourceUrl: data.sourceUrl, events: result.deadline && current.events.length < 50 && !current.events.some(event => event.kind === 'deadline') ? [...current.events, { id: crypto.randomUUID(), kind: 'deadline', date: result.deadline, time: '', title: '', location: '' }] : current.events }));
      setMessage(`공고에서 읽은 초안이에요. 회사·직무·마감일을 원문과 비교한 뒤 저장해주세요.${result.deadline ? ` 공고에서 읽은 마감일: ${result.deadline}. 기존 마감 일정이 있으면 유지됩니다.` : ''} 마감 시간은 직접 확인해주세요.`);
    } catch (cause) { if (alive.current) { setMessage(''); setError(cause instanceof Error ? cause.message : '공고 내용을 직접 붙여넣어주세요.'); } }
    finally { if (alive.current) { setPending(false); onBusy(false); } }
  }
  const filtered = records.filter(record => {
    const value = record.details;
    return (filter === 'all' || (filter === 'archived' ? value.archived : !value.archived && (filter === 'active' || value.status === filter))) && `${value.company} ${value.position}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return <section id="applications" className="applications" aria-labelledby="applications-title">
    <div className="applications-top"><div><p className="eyebrow">MY APPLICATIONS</p><h2 id="applications-title">지원부터, 다음 일정까지.</h2><p>회사별 준비 내용과 지난 지원을 한곳에 기록하세요.</p></div><div className="application-actions"><button className="button secondary" disabled={locked || !userId} onClick={() => void load()}>{pending ? '처리 중…' : loaded ? '다시 불러오기' : '내 기록 불러오기'}</button><button className="button primary" disabled={locked} onClick={() => choose(null)}><Plus size={16}/> 지원 추가</button></div></div>
    {!userId && <p className="message">공고 링크를 읽고 작업실로 보낼 수 있어요. 기록과 일정을 저장하려면 위에서 Google로 로그인해주세요.</p>}
    {error && <p className="message error" role="alert">{error}</p>}{message && <p className="message" role="status">{message}</p>}
    <div className="application-tabs"><button aria-pressed={view === 'list'} onClick={() => setView('list')}>지원 기록 <span>{records.length}</span></button><button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>캘린더</button></div>
    <div className={`applications-layout${editing ? ' has-editor' : ''}`}>
      <div className="applications-overview">
        {view === 'calendar' ? <ApplicationCalendar records={records} onSelect={choose}/> : <>
          <div className="application-filters"><input aria-label="지원 회사 검색" placeholder="회사·직무 검색" value={search} onChange={event => setSearch(event.target.value)}/><select aria-label="지원 상태 필터" value={filter} onChange={event => setFilter(event.target.value)}><option value="active">보관 제외 전체</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="archived">보관한 기록</option><option value="all">과거 포함 전체</option></select></div>
          {filtered.length ? <ul className="application-list">{filtered.map(record => <li key={record.id}><button disabled={locked} aria-pressed={record.id === selected?.id} onClick={() => choose(record)}><span className={`application-status ${record.details.status}`}>{record.details.archived ? '보관 · ' : ''}{statusLabels[record.details.status]}</span><strong>{record.details.company}</strong><span>{record.details.position || '직무 미입력'}</span><small>{record.details.appliedOn ? `제출 ${record.details.appliedOn}` : `수정 ${new Date(record.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`} · 일정 {record.details.events.length}개</small></button></li>)}</ul> : <div className="application-empty"><p>{loaded ? '아직 표시할 지원 기록이 없어요.' : '나의 다음 기회를 정리해보세요.'}</p><span>{loaded ? '새 지원을 추가하거나 필터를 바꿔보세요.' : '처음에는 지원 추가, 이전 기록은 내 기록 불러오기를 눌러주세요.'}</span></div>}
        </>}
      </div>
      {editing && <form id="application-editor" className="application-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="editor-heading"><h3>{selected ? details.company : '새 지원 기록'}</h3><button className="icon-button" type="button" aria-label="지원 편집 닫기" disabled={locked} onClick={() => { if (canLeave()) setEditing(false); }}><X size={18}/></button></div>
        <fieldset disabled={locked} className="work-fields">
          <div className="job-link-box"><label className="field"><span><Link2 size={15}/> 채용공고 링크</span><input type="url" maxLength={2048} value={details.sourceUrl} placeholder="https://… 채용공고 주소" onChange={event => update('sourceUrl', event.target.value)}/></label><label className="consent"><input type="checkbox" checked={linkConsent} onChange={event => setLinkConsent(event.target.checked)}/><span>링크와 API 키를 Google로 보내 공고를 읽는 데 동의해요. API 사용량이 발생할 수 있으며, 이력서는 전송하지 않아요.</span></label><button type="button" className="button secondary" onClick={() => void importLink()}>링크로 정보 채우기 <ArrowUpRight size={15}/></button><p className="helper">아래 작업실의 Gemini 키를 사용해요. 읽을 수 없는 공고는 직접 붙여넣어도 됩니다.</p></div>
          <div className="field-grid"><label className="field"><span>회사명 *</span><input required maxLength={120} value={details.company} onChange={event => update('company', event.target.value)}/></label><label className="field"><span>지원 직무</span><input maxLength={120} value={details.position} onChange={event => update('position', event.target.value)}/></label></div>
          <div className="field-grid"><label className="field"><span>현재 상태</span><select value={details.status} onChange={event => update('status', event.target.value as ApplicationDetails['status'])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>서류 제출일</span><input type="date" value={details.appliedOn} onChange={event => update('appliedOn', event.target.value)}/></label></div>
          <details className="application-extra"><summary>공고·자소서 문항 {details.job ? '· 공고 있음' : ''}</summary><label className="field"><span>채용공고 내용</span><textarea rows={5} maxLength={16000} value={details.job} onChange={event => update('job', event.target.value)}/></label><label className="field"><span>자소서 문항 / 면접 질문</span><textarea rows={3} maxLength={5000} value={details.question} onChange={event => update('question', event.target.value)}/></label></details>
          <div className="event-heading"><h4>일정 <small>한국 시간</small></h4><button type="button" className="quiet" disabled={details.events.length >= 50} onClick={() => update('events', [...details.events, { id: crypto.randomUUID(), kind: 'interview', date: koreaToday(), time: '', title: '', location: '' }])}><Plus size={14}/> 일정 추가</button></div>
          {!details.events.length && <p className="helper">서류 마감, 시험, 면접 날짜를 추가해보세요.</p>}
          {details.events.map((item, index) => <div className="event-editor" key={item.id}><div className="event-row"><select aria-label={`일정 ${index + 1} 종류`} value={item.kind} onChange={event => update('events', details.events.map(value => value.id === item.id ? { ...value, kind: event.target.value as typeof item.kind } : value))}>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="icon-button" aria-label={`일정 ${index + 1} 제거`} onClick={() => update('events', details.events.filter(value => value.id !== item.id))}><X size={16}/></button></div><div className="event-row"><input aria-label={`일정 ${index + 1} 날짜`} type="date" required value={item.date} onChange={event => update('events', details.events.map(value => value.id === item.id ? { ...value, date: event.target.value } : value))}/><input aria-label={`일정 ${index + 1} 시간, 비우면 종일`} type="time" value={item.time} onChange={event => update('events', details.events.map(value => value.id === item.id ? { ...value, time: event.target.value } : value))}/></div><input aria-label={`일정 ${index + 1} 제목`} placeholder="일정 제목 (선택)" maxLength={160} value={item.title} onChange={event => update('events', details.events.map(value => value.id === item.id ? { ...value, title: event.target.value } : value))}/><input aria-label={`일정 ${index + 1} 장소`} placeholder="장소·준비물 (선택)" maxLength={500} value={item.location} onChange={event => update('events', details.events.map(value => value.id === item.id ? { ...value, location: event.target.value } : value))}/></div>)}
          <label className="field"><span>지원 메모</span><textarea rows={3} maxLength={12000} placeholder="시험 준비, 면접 질문, 결과와 회고를 기록하세요." value={details.notes} onChange={event => update('notes', event.target.value)}/></label>
          <details className="application-extra"><summary>제출 답변 보관 {details.answer ? '· 답변 있음' : ''}</summary><label className="field"><span>이 지원에 보관할 답변</span><textarea rows={6} maxLength={20000} value={details.answer} onChange={event => update('answer', event.target.value)}/></label><button type="button" className="quiet" disabled={!currentAnswer.body || currentAnswer.company !== details.company || currentAnswer.position !== details.position} onClick={() => { if (!details.answer || window.confirm('보관할 답변을 현재 작업실의 결과로 바꿀까요?')) update('answer', currentAnswer.body); }}>작업실의 현재 답변 가져오기</button><p className="helper">회사와 직무가 같은 작업실 답변을 가져올 수 있어요. 저장 버튼을 눌러 보관하세요.</p></details>
          {selected && <details className="application-extra"><summary>상태 변경 기록 ({selected.history.length})</summary><ol className="status-history">{selected.history.map((item, index) => <li key={index}><time>{new Date(item.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</time><span>{statusLabels[item.status]}</span></li>)}</ol></details>}
          <div className="editor-actions"><button className="button primary" type="submit" disabled={!userId}>{pending ? '저장 중…' : '지원 기록 저장'}</button><button className="button secondary" type="button" onClick={() => onChoose(details)}>이 정보로 작성 <ArrowUpRight size={15}/></button>{selected && <button type="button" className="quiet" onClick={() => void save({ ...details, archived: !details.archived })}><Archive size={14}/>{details.archived ? '보관 해제하고 저장' : '지난 기록으로 보관'}</button>}</div><p className="helper">{dirty ? '저장하지 않은 변경이 있어요. ' : ''}저장하면 캘린더에도 반영돼요. 보관한 기록은 필터에서 다시 확인할 수 있어요.</p>
        </fieldset>
      </form>}
    </div>
  </section>;
}
