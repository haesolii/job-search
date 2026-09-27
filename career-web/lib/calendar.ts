import type { ApplicationRecord } from './applications.ts';
import { eventLabels } from './applications.ts';

export function koreaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function monthDays(month: string): (string | null)[] {
  const [year, number] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const days: (string | null)[] = Array.from({ length: start }, () => null);
  for (let day = 1; day <= length; day++) days.push(`${month}-${String(day).padStart(2, '0')}`);
  while (days.length % 7) days.push(null);
  return days;
}

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function calendarEvents(records: ApplicationRecord[]) {
  return records.filter(record => !record.details.archived).flatMap(record => record.details.events.map(event => ({ ...event, applicationId: record.id, company: record.details.company, position: record.details.position, updatedAt: record.updated_at })))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.company.localeCompare(b.company));
}

function escapeText(text: string) { return text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function fold(line: string) {
  let result = '', size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) { result += '\r\n '; size = 1; }
    result += char; size += bytes;
  }
  return result;
}
function stamp(date: Date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

export function exportCalendar(records: ApplicationRecord[], now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Career Note//Applications//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:커리어노트 지원 일정'];
  for (const event of calendarEvents(records)) {
    const start = event.time ? new Date(`${event.date}T${event.time}:00+09:00`) : new Date(`${event.date}T00:00:00Z`);
    lines.push('BEGIN:VEVENT', `UID:${event.applicationId}-${event.id}@career-note`, `DTSTAMP:${stamp(now)}`, `LAST-MODIFIED:${stamp(new Date(event.updatedAt))}`);
    if (event.time) {
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 60 * 60 * 1000))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${new Date(start.getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${escapeText(`${event.company} · ${event.title || eventLabels[event.kind]}`)}`, `DESCRIPTION:${escapeText(`${event.position}\n${eventLabels[event.kind]}${event.time ? '\n한국 시간 기준 · 종료 시간은 1시간 후로 설정되어 있습니다.' : ''}`)}`, `LOCATION:${escapeText(event.location)}`, 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
