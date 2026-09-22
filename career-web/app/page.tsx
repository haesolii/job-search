'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, ArrowLeft, Check, Copy, Download, FileText, KeyRound, LockKeyhole, Plus, RotateCcw, Upload, X, LoaderCircle, PenLine, MessageSquare, ScanText, ShieldCheck } from 'lucide-react';
import { appendFollowup, countText, type CareerDocument, type CoachInput, type CoachResult, inputSchema, MAX_FILE_BYTES, modes, resultSchema, roles, SKILL_VERSION } from '../lib/coach';
import AccountPanel from './account-panel';
import type { Snapshot } from '../lib/workspace';

const initial: CoachInput = { mode: 'draft', company: '', position: '', question: '', limit: 700, experience: '', job: '', draft: '', documents: [], previous: '', followup: '', consent: true };
const modeIcons = { draft: PenLine, revise: ScanText, feedback: MessageSquare, interview: MessageSquare };

function saveFile(text: string, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CoachInput>(initial);
  const [apiKey, setApiKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [resultContext, setResultContext] = useState<Snapshot['resultContext']>(initial);
  const [loading, setLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [followup, setFollowup] = useState('');
  const controller = useRef<AbortController | null>(null);
  const workspaceGeneration = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const guide = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const counts = countText(result?.body || '');
  const overLimit = counts.withSpaces > resultContext.limit;
  const hasExperience = Boolean(form.experience.trim() || form.documents.some(d => d.role === 'candidate'));
  const update = <K extends keyof CoachInput>(key: K, value: CoachInput[K]) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!apiKey && !form.experience && !form.documents.length && !result) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [apiKey, form.experience, form.documents.length, result]);

  function go(next: number) {
    if (loading || fileBusy || accountBusy) return;
    if (next > 0 && !hasExperience) { setError('이력서를 올리거나 경험을 직접 입력해주세요.'); return; }
    if (next === 2 && !result) { setError('지원 정보를 입력한 뒤 답변을 만들어주세요.'); return; }
    setError(''); setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const generation = workspaceGeneration.current;
    setFileBusy(true); setError('');
    try {
      const added: CareerDocument[] = [];
      if (form.documents.length + files.length > 5) throw new Error('파일은 최대 5개까지 올릴 수 있어요.');
      let total = form.documents.reduce((sum, doc) => sum + (doc.mime === 'application/pdf' ? Math.floor(doc.data.length * 3 / 4) : new TextEncoder().encode(doc.data).length), 0);
      for (const file of Array.from(files)) {
        total += file.size;
        if (total > MAX_FILE_BYTES) throw new Error('전체 파일 용량은 2MB까지예요. PDF 용량을 줄이거나 필요한 부분을 텍스트로 붙여넣어 주세요.');
        if (!/\.(pdf|txt|md)$/i.test(file.name)) throw new Error('PDF, TXT, MD 파일을 올려주세요. 한글·워드 파일은 PDF로 저장하면 사용할 수 있어요.');
        if (file.name.length > 180) throw new Error('파일 이름을 180자 이내로 줄여주세요.');
        if ([...form.documents, ...added].some(doc => doc.name === file.name)) throw new Error('같은 이름의 파일이 있어요. 기존 파일을 지우거나 이름을 바꿔주세요.');
        const pdf = /\.pdf$/i.test(file.name);
        let data: string;
        if (pdf) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF 파일을 읽을 수 없어요. PDF로 다시 저장해주세요.');
          let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
          data = btoa(binary);
        } else {
          data = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
          if (!data.trim() || data.includes('\0')) throw new Error('빈 파일이거나 텍스트 형식이 아니에요. 내용을 확인해주세요.');
        }
        const role = /공고|채용|job/i.test(file.name) ? 'job' : /기업|회사|IR/.test(file.name) ? 'company' : /합격|예시|sample/i.test(file.name) ? 'example' : 'candidate';
        added.push({ name: file.name, role, mime: pdf ? 'application/pdf' : 'text/plain', data });
      }
      if (generation !== workspaceGeneration.current) return;
      setForm(current => ({ ...current, documents: [...current.documents, ...added] }));
      setNotice('파일을 준비했어요. 각 파일의 자료 종류를 확인해주세요.');
    } catch (cause) { setError(cause instanceof TypeError ? 'UTF-8 텍스트 또는 PDF 파일로 저장해서 다시 올려주세요.' : cause instanceof Error ? cause.message : '파일을 읽지 못했어요. 다시 올려주세요.'); }
    finally { setFileBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  function cancel() {
    controller.current?.abort(); controller.current = null; setLoading(false);
    setNotice('요청을 멈췄어요. 입력과 이전 결과는 그대로예요. 이미 전송된 요청에는 API 요금이 발생할 수 있어요.');
  }

  async function generate(revision = false, shorten = false) {
    setError(''); setNotice('');
    if (!apiKey.trim()) { setError('상단의 Gemini API 키를 먼저 입력해주세요.'); document.getElementById('api-key')?.focus(); return; }
    if (!consent) { setError('자료 전송 안내를 확인하고 동의해주세요.'); return; }
    if (revision && !shorten && !followup.trim()) { setError('추가로 알려줄 내용이나 수정 요청을 입력해주세요.'); return; }
    const nextFollowup = revision ? appendFollowup(form.followup, shorten ? '분량 조정' : result?.question || '', shorten ? `앞선 본문의 확인된 사실을 보존하면서 공백·줄바꿈 포함 ${form.limit}자 이내로 줄여주세요.` : followup) : form.followup;
    if (nextFollowup.length > 12000) { setError('추가 대화가 길어졌어요. 확인된 사실을 경험 입력란에 정리하고 새 작업으로 시작해주세요. 결과는 먼저 내려받아 주세요.'); return; }
    const input = { ...form, previous: revision ? result?.body || '' : '', followup: nextFollowup, consent };
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message.startsWith('첨삭') ? '첨삭·피드백을 받으려면 작성한 원문을 넣어주세요.' : '회사, 직무, 문항과 글자 수를 확인해주세요.'); setStep(1); return; }
    const active = new AbortController(); controller.current = active; setLoading(true);
    try {
      const response = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gemini-key': apiKey.trim() }, body: JSON.stringify(parsed.data), signal: active.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했어요. 다시 시도해주세요.');
      const checked = resultSchema.safeParse(data.result);
      if (!checked.success) throw new Error('답변을 읽지 못했어요. 다시 시도해주세요.');
      if (controller.current !== active) return;
      setResult(checked.data); setResultContext(input); setForm(input); setFollowup(''); setStep(2);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (cause) {
      if (controller.current === active && !active.signal.aborted) setError(cause instanceof Error ? cause.message : '연결이 끊겼어요. 다시 시도해주세요.');
    } finally { if (controller.current === active) { controller.current = null; setLoading(false); } }
  }

  function clear() {
    workspaceGeneration.current++;
    controller.current?.abort(); controller.current = null; setLoading(false);
    setForm(initial); setResult(null); setResultContext(initial); setApiKey(''); setConsent(false); setFollowup(''); setError(''); setStep(0); setNotice('화면의 입력을 지웠어요. 계정의 저장본은 유지됩니다.');
  }

  function reset() {
    if (!window.confirm('이 페이지의 키, 자료와 결과를 모두 지울까요? 계정의 저장본은 유지됩니다.')) return;
    clear();
  }

  function snapshot(): Snapshot {
    const { consent: _consent, ...fields } = form;
    const { company, position, mode, limit } = resultContext;
    return { form: fields, result, resultContext: { company, position, mode, limit }, followup, step };
  }

  function restore(value: Snapshot) {
    clear(); setForm({ ...value.form, consent: true }); setResult(value.result); setResultContext(value.resultContext); setFollowup(value.followup); setStep(value.step); setNotice('');
  }

  async function copy() {
    try { await navigator.clipboard.writeText(result?.body || result?.diagnosis || ''); setNotice('클립보드에 복사했어요.'); }
    catch { setError('복사 권한을 확인하거나 본문을 직접 선택해 복사해주세요.'); }
  }

  return <>
    <a className="skip-link" href="#workspace">본문으로 건너뛰기</a>
    <header className="site-header wrap">
      <a className="brand" href="#top" aria-label="커리어노트 처음으로"><span className="brand-mark" aria-hidden="true"><i/><i/><i/><b/></span>career note<span className="brand-period">.</span></a>
      <nav aria-label="주 메뉴"><a href="#workspace">작업실</a><a href="#guide" onClick={() => { if (guide.current) guide.current.open = true; }}>시작 가이드 <ArrowUpRight size={14}/></a></nav>
      <span className="header-note">나의 경험, 다음 기회.</span>
    </header>

    <main id="top">
      <section className="intro wrap" aria-labelledby="intro-title">
        <div><p className="eyebrow"><span/> YOUR NEXT CHAPTER</p><h1 id="intro-title">좋은 경험을,<br/>설득력 있는 문장으로<span className="orange">.</span></h1><p className="intro-copy">무엇을 쓸지 막막할 때, 내 경험에서 시작하세요.<br className="desktop-break"/> 이력서와 지원할 곳을 알려주면 다음 문장을 함께 찾습니다.</p><a className="text-link" href="#workspace">내 이야기 시작하기 <ArrowRight size={18}/></a></div>
        <div className="intro-note" aria-label="코칭 진행 방식">
          <div className="note-top"><span>THE WRITING PROCESS</span><span>01—03</span></div>
          <div className="note-path"><span>경험</span><i/><span>직무</span><i/><span className="last">내 문장</span></div>
          <div className="note-bottom"><span>있는 그대로의 경험에서<br/>나만의 근거를 찾습니다.</span><ArrowUpRight size={35} strokeWidth={1}/></div>
        </div>
      </section>

      <section className="workspace-band" id="workspace">
        <div className="wrap">
          <div className="section-top"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>나의 작업실</h2></div><span className="version">COACHING SKILL <b>v{SKILL_VERSION}</b></span></div>
          <AccountPanel snapshot={snapshot} restore={restore} clear={clear} busy={loading || fileBusy} onBusy={setAccountBusy}/>
          <div className="desk" inert={accountBusy} aria-busy={accountBusy}>
            <aside className="desk-sidebar">
              <p className="small-title">오늘 필요한 도움</p>
              <div className="mode-list" role="group" aria-label="코칭 목적">
                {(Object.keys(modes) as (keyof typeof modes)[]).map(mode => { const Icon = modeIcons[mode]; return <button key={mode} type="button" aria-pressed={form.mode === mode} disabled={loading} className={form.mode === mode ? 'mode active' : 'mode'} onClick={() => { update('mode', mode); if (step === 2) setStep(1); }}><Icon size={18} strokeWidth={1.5}/>{modes[mode]}{form.mode === mode && <span className="mode-dot"/>}</button>; })}
              </div>
              <div className="sidebar-bottom"><ShieldCheck size={22} strokeWidth={1.2}/><h3>내 경험은, 내 것.</h3><p>생성 시 Google로 전송하고, 저장을 누르면 내 계정에 보관해요. API 키는 저장하지 않아요.</p><button className="quiet" type="button" onClick={reset} disabled={fileBusy}><RotateCcw size={14}/> 모두 지우고 새로 시작</button></div>
            </aside>

            <div className="desk-main">
              <div className="stepper" aria-label="진행 단계">{['자료 준비', '지원 정보', '결과 다듬기'].map((label, index) => <button type="button" aria-current={step === index ? 'step' : undefined} key={label} onClick={() => go(index)} disabled={loading || fileBusy} className={step === index ? 'step current' : 'step'}><span>{step > index ? <Check size={14}/> : `0${index + 1}`}</span>{label}</button>)}</div>

              <div className="key-strip"><KeyRound size={17} strokeWidth={1.5}/><label htmlFor="api-key">Gemini API 키</label><input id="api-key" type="password" value={apiKey} autoComplete="off" spellCheck={false} placeholder="발급받은 키를 붙여넣으세요" maxLength={256} disabled={loading} onChange={e => setApiKey(e.target.value)}/>{apiKey && <button className="icon-button" aria-label="API 키 지우기" onClick={() => { cancel(); setApiKey(''); }}><X size={16}/></button>}<a href="#guide" onClick={() => { if (guide.current) guide.current.open = true; }}>키 받는 법 <ArrowUpRight size={13}/></a></div>

              {error && <div className="message error" role="alert">{error}</div>}
              {notice && <div className="message" role="status">{notice}</div>}

              <div className="work-content">
                <div className="work-title"><span className="chapter">0{step + 1}</span><div><h3 ref={heading} tabIndex={-1}>{['먼저, 나를 알려주세요.', '어떤 기회를 준비하나요?', '내 목소리로 한 번 더.'][step]}</h3><p>{['잘 정리된 이력서가 아니어도 괜찮아요. 경험 메모부터 시작할 수 있어요.', '공고와 문항을 구체적으로 알려줄수록, 내 경험과의 연결이 선명해져요.', '확인된 사실과 내 말투를 살펴보고, 필요한 부분을 함께 다듬어보세요.'][step]}</p></div></div>

                <fieldset disabled={loading || fileBusy || accountBusy} className="work-fields">
                  {step === 0 && <>
                    <input className="sr-only" ref={fileInput} id="resume-files" type="file" accept=".pdf,.txt,.md" multiple onChange={e => void upload(e.target.files)}/>
                    <button type="button" className="upload-area" onClick={() => fileInput.current?.click()}><Upload size={28} strokeWidth={1.2}/><strong>{fileBusy ? '파일을 읽고 있어요' : '이력서 또는 경험 자료 올리기'}</strong><span>PDF · TXT · MD / 최대 5개, 전체 2MB</span><span className="upload-cta"><Plus size={14}/> 파일 선택</span></button>
                    <p className="helper">한글·워드 문서는 PDF로 저장해 주세요. 공고·기업 자료도 함께 올릴 수 있어요.</p>
                    {form.documents.length > 0 && <ul className="file-list">{form.documents.map((doc, index) => <li key={doc.name}><FileText size={18}/><span className="file-name">{doc.name}</span><select aria-label={`${doc.name} 자료 종류`} value={doc.role} onChange={e => update('documents', form.documents.map((item, i) => i === index ? { ...item, role: e.target.value as CareerDocument['role'] } : item))}>{Object.entries(roles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className="icon-button" type="button" aria-label={`${doc.name} 삭제`} onClick={() => update('documents', form.documents.filter((_, i) => i !== index))}><X size={16}/></button></li>)}</ul>}
                    <label className="field" htmlFor="experience"><span>경험을 직접 적어도 좋아요 <small>파일이 있다면 선택</small></span><textarea id="experience" rows={5} maxLength={24000} value={form.experience} onChange={e => update('experience', e.target.value)} placeholder={'어떤 상황에서, 무엇을 판단하고, 직접 무엇을 했나요?\n완성한 결과물이나 확인한 변화를 편하게 적어주세요.'}/></label>
                    <div className="field-note"><LockKeyhole size={15}/><span>주민등록번호·주소 등 불필요한 개인정보는 빼주세요.<br/>생성 또는 저장을 누르면 자료가 서버로 전송돼요.</span></div>
                    <div className="form-footer"><span>{form.documents.length ? `${form.documents.length}개 자료 준비됨` : '내 경험만 준비하면 시작할 수 있어요.'}</span><button type="button" className="button primary" onClick={() => go(1)}>지원 정보 입력 <ArrowRight size={16}/></button></div>
                  </>}

                  {step === 1 && <>
                    <div className="field-grid"><label className="field" htmlFor="company"><span>지원 회사 <b>*</b></span><input id="company" maxLength={120} value={form.company} onChange={e => update('company', e.target.value)} placeholder="회사 이름" required/></label><label className="field" htmlFor="position"><span>지원 직무 <b>*</b></span><input id="position" maxLength={120} value={form.position} onChange={e => update('position', e.target.value)} placeholder="지원하는 직무" required/></label></div>
                    <label className="field" htmlFor="question"><span>{form.mode === 'interview' ? '준비할 면접 질문' : '자기소개서 문항'} <b>*</b></span><textarea id="question" maxLength={5000} rows={3} value={form.question} onChange={e => update('question', e.target.value)} placeholder="공고에 적힌 문항을 그대로 붙여넣어 주세요." required/></label>
                    <div className="limit-row"><label htmlFor="limit">최대 글자 수</label><input id="limit" type="number" min={100} max={5000} step={50} value={form.limit} onChange={e => update('limit', Number(e.target.value))}/><span>자 · 공백과 줄바꿈 포함</span></div>
                    <label className="field" htmlFor="job"><span>채용 공고 <small>공고 파일이 있다면 선택</small></span><textarea id="job" maxLength={16000} rows={4} value={form.job} onChange={e => update('job', e.target.value)} placeholder="담당 업무, 필수·우대 조건을 붙여넣어 주세요. 링크만으로는 공고를 읽을 수 없어요."/></label>
                    {(form.mode === 'revise' || form.mode === 'feedback') && <label className="field" htmlFor="draft"><span>작성한 원문 <b>*</b></span><textarea id="draft" maxLength={16000} rows={8} value={form.draft} onChange={e => update('draft', e.target.value)} placeholder="검토할 자소서 원문을 붙여넣어 주세요." required/></label>}
                    <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>입력 자료와 키가 이 사이트 서버를 거쳐 Google Gemini로 전달되는 데 동의해요. API 키는 저장하지 않으며, Google 정책과 본인 계정의 API 요금·한도가 적용돼요. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google 이용약관 <ArrowUpRight size={12}/></a></span></label>
                    <div className="form-footer"><button type="button" className="quiet" onClick={() => go(0)}><ArrowLeft size={15}/> 자료 준비</button><button type="button" className="button primary" onClick={() => void generate()}>{form.mode === 'feedback' ? '피드백 받기' : '답변 만들기'} <ArrowUpRight size={17}/></button></div>
                  </>}

                  {step === 2 && result && <>
                    <div className="result-meta"><span>{resultContext.company} / {resultContext.position}</span><span>{modes[resultContext.mode]}</span></div>
                    {result.body && <><label className="field result-field" htmlFor="result-body"><span>나의 답변 <small>직접 수정할 수 있어요</small></span><textarea id="result-body" rows={12} maxLength={20000} value={result.body} onChange={e => setResult({ ...result, body: e.target.value })}/></label><div className={`result-count ${overLimit ? 'over-limit' : ''}`}><span>공백 포함 <b>{counts.withSpaces.toLocaleString()}</b> / {resultContext.limit.toLocaleString()}자</span><span>공백 제외 {counts.withoutSpaces.toLocaleString()}자</span></div>{overLimit && <div className="message error">제한보다 {counts.withSpaces - resultContext.limit}자 많아요. 제출 전에 줄여주세요. <button type="button" className="text-link" onClick={() => void generate(true, true)}>분량 맞춰 다시 다듬기 <ArrowRight size={14}/></button></div>}</>}
                    <div className="coach-note"><p className="small-title">코치의 메모</p><p>{result.diagnosis}</p>{result.suggestions.length > 0 && <ul>{result.suggestions.map((text, i) => <li key={i}>{text}</li>)}</ul>}</div>
                    {result.evidence.length > 0 && <details className="evidence"><summary>반영한 근거 확인하기</summary><ul>{result.evidence.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="helper">AI가 정리한 근거예요. 원본과 대조해 사실을 확인해주세요.</p></details>}
                    <div className="result-actions"><button type="button" className="button secondary" onClick={() => void copy()}><Copy size={16}/> {result.body ? '본문 복사' : '진단 복사'}</button><button type="button" className="button primary" onClick={() => saveFile([result.body, '\n[코치의 메모]', result.diagnosis, ...result.suggestions, result.question].filter(Boolean).join('\n\n'), '커리어노트-결과.txt')}><Download size={16}/> 결과 내려받기</button></div>
                    <div className="followup"><label className="field" htmlFor="followup"><span>{result.question || '조금 더 다듬고 싶은 부분이 있나요?'}</span><textarea id="followup" maxLength={4000} rows={3} value={followup} onChange={e => setFollowup(e.target.value)} placeholder="질문에 답하거나, 바꾸고 싶은 내용을 알려주세요."/></label><button className="button secondary" type="button" onClick={() => void generate(true)}>답변 반영해 다듬기 <ArrowRight size={16}/></button></div>
                    <button type="button" className="quiet" onClick={() => go(1)}><ArrowLeft size={14}/> 지원 정보 수정하기</button>
                  </>}
                </fieldset>
                {loading && <div className="loading" role="status"><LoaderCircle className="spin" size={21}/><div><strong>내 경험과 문항을 연결하고 있어요.</strong><p>자료를 읽고 문장을 다듬는 데 시간이 걸릴 수 있어요.</p></div><button type="button" className="button secondary" onClick={cancel}>중지</button></div>}
              </div>
            </div>
          </div>
          <div className="workspace-foot"><span>사실을 더하지 않고, 나의 근거를 더 선명하게.</span><button type="button" className="quiet mobile-reset" onClick={reset} disabled={fileBusy}><RotateCcw size={13}/> 모두 지우기</button><span>PRIVATE BY DESIGN <LockKeyhole size={12}/></span></div>
        </div>
      </section>

      <section className="guide-section wrap" id="guide">
        <div className="guide-heading"><p className="eyebrow">A LITTLE HELP TO BEGIN</p><h2>처음이어도 괜찮아요.</h2><p>한 번만 준비하면, 내 키로 편하게 시작할 수 있어요.</p></div>
        <div className="guides">
          <details ref={guide}><summary><span>01</span> Gemini API 키, 어떻게 받나요?<Plus size={20}/></summary><div className="guide-body"><ol><li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio 열기 <ArrowUpRight size={14}/></a>에서 Google 계정으로 로그인하세요.</li><li>안내에 동의하고 <strong>API 키 만들기(Create API key)</strong>를 선택하세요. 새 프로젝트를 만들거나 사용할 프로젝트를 선택하면 됩니다.</li><li>만들어진 키를 복사해 작업실의 <strong>Gemini API 키</strong> 칸에 붙여넣으세요. 다른 사람에게 공유하지 마세요.</li><li>본인 이력서를 올리고 지원 정보를 입력한 뒤 <strong>답변 만들기</strong>를 눌러주세요.</li></ol><p>키는 이 페이지에서만 사용해요. 새로고침하면 다시 입력해야 합니다. 무료 사용 가능 여부와 한도는 모델·지역·계정에 따라 달라요. 결제를 연결했다면 사용료가 발생할 수 있으니 AI Studio에서 확인해주세요.</p><a className="text-link" href="https://ai.google.dev/gemini-api/docs/api-key?hl=ko" target="_blank" rel="noreferrer">Google 공식 발급 안내 <ArrowUpRight size={14}/></a></div></details>
          <details><summary><span>02</span> 어떤 자료를 준비하면 좋나요?<Plus size={20}/></summary><div className="guide-body"><p>이력서, 포트폴리오, 프로젝트 메모 중 하나면 시작할 수 있어요. 직접 한 행동과 확인된 결과가 담기면 더 좋아요. 파일이 없다면 경험 입력란에 적어주세요.</p><p>채용 공고·기업 자료·참고 자소서는 파일 옆에서 종류를 구분해주세요. 참고 자소서는 구성만 참고하고 다른 사람의 경험을 내 이력으로 사용하지 않아요.</p><p>PDF·TXT·MD를 지원해요. HWP·DOCX는 원래 프로그램에서 PDF로 저장해주세요. 암호화된 PDF는 해제하고, 파일은 최대 5개·전체 2MB로 준비해주세요.</p></div></details>
          <details><summary><span>03</span> 자료와 API 키는 어디에 저장되나요?<Plus size={20}/></summary><div className="guide-body"><p>Google 로그인 후 현재 작업 저장을 누르면 이력서·입력·결과를 Supabase 데이터베이스에 계정별로 보관해요. 저장본 불러오기로 이어서 작성하고, 저장본 삭제로 서버의 자료를 지울 수 있어요. 저장하지 않은 입력은 페이지를 닫으면 사라져요. API 키는 현재 페이지 메모리에만 남으며 저장본에 포함되지 않아요.</p><p>생성을 요청하면 자료와 키가 이 사이트 서버를 거쳐 Google Gemini로 전달돼요. Google의 처리·보관 정책은 별도로 적용됩니다. 민감한 정보는 올리기 전에 지워주세요.</p><p>실제 생성은 본인 Google 계정의 API 사용량으로 계산돼요. 키 지우기 또는 모두 지우고 새로 시작으로 현재 입력을 지울 수 있어요.</p></div></details>
        </div>
      </section>
    </main>
    <footer className="wrap footer"><a className="brand" href="#top">career note<span className="brand-period">.</span></a><p>나의 경험으로 쓰는, 다음 기회. · <a href="/privacy">개인정보 처리 안내</a></p><span>METHOD v{SKILL_VERSION} · 2026</span></footer>
  </>;
}
