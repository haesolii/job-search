'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { type ApplicationRecord, eventLabels } from '../lib/applications';
import { calendarEvents, exportCalendar, koreaToday, monthDays, shiftMonth } from '../lib/calendar';

export default function ApplicationCalendar({ records, onSelect }: { records: ApplicationRecord[]; onSelect: (record: ApplicationRecord) => void }) {
  const today = koreaToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const events = calendarEvents(records);
  const shown = events.filter(event => day ? event.date === day : event.date.startsWith(month));
  function move(offset: number) { setMonth(shiftMonth(month, offset)); setDay(null); }
  return <section className="application-calendar" aria-label="지원 일정 캘린더">
    <div className="calendar-heading"><div><p className="eyebrow">YOUR NEXT DATE</p><h3>{month.replace('-', '년 ')}월</h3></div><div className="calendar-controls"><button className="icon-button" aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft size={18}/></button><button onClick={() => { setMonth(today.slice(0, 7)); setDay(null); }}>오늘</button><button className="icon-button" aria-label="다음 달" onClick={() => move(1)}><ChevronRight size={18}/></button></div></div>
    <div className="calendar-grid">
      {['일', '월', '화', '수', '목', '금', '토'].map(label => <span className="weekday" key={label}>{label}</span>)}
      {monthDays(month).map((date, index) => {
        const items = events.filter(event => event.date === date);
        return date ? <button key={date} className={`calendar-day${date === today ? ' today' : ''}${date === day ? ' selected' : ''}`} aria-pressed={date === day} aria-label={`${date}, 일정 ${items.length}개`} onClick={() => setDay(date === day ? null : date)}><span>{Number(date.slice(-2))}</span>{items.length > 0 && <><i aria-hidden="true"/><small>{items.length}건</small></>}</button> : <span key={`blank-${index}`} className="calendar-blank"/>;
      })}
    </div>
    <div className="agenda-heading"><h4>{day ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(-2))}일` : '이번 달 일정'}</h4>{day && <button className="quiet" onClick={() => setDay(null)}>월 전체 보기</button>}</div>
    {shown.length ? <ul className="agenda-list">{shown.map(event => <li key={`${event.applicationId}-${event.id}`}><button onClick={() => { const record = records.find(item => item.id === event.applicationId); if (record) onSelect(record); }}><time dateTime={event.date}>{event.date.slice(5).replace('-', '.')}<small>{event.time || '종일'}</small></time><span><strong>{event.company}</strong><small>{event.title || eventLabels[event.kind]} · {event.position}</small>{event.location && <small>{event.location}</small>}</span><span className={`event-kind ${event.kind}`}>{eventLabels[event.kind]}</span></button></li>)}</ul> : <p className="empty-note">{day ? '이 날짜에는 저장된 일정이 없어요.' : '이번 달 일정이 없어요. 지원 기록에서 마감·시험·면접 날짜를 추가하세요.'}</p>}
    {events.length ? <a className="button secondary calendar-export" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(exportCalendar(records))}`} download="커리어노트-지원일정.ics"><Download size={15}/> 전체 일정 내보내기 (.ics)</a> : <button className="button secondary calendar-export" disabled><Download size={15}/> 전체 일정 내보내기 (.ics)</button>}
    <p className="helper">저장된 기록 중 보관하지 않은 일정만 포함해요. 시간은 한국 기준이며, 시간이 있는 일정의 길이는 1시간으로 내보냅니다. Google·Apple·Outlook 캘린더에서 파일을 가져올 수 있어요. 변경 후에는 다시 내보내주세요.</p>
  </section>;
}
