import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCalendar, koreaToday, monthDays, shiftMonth } from './calendar.ts';
import { emptyDetails, type ApplicationRecord } from './applications.ts';

test('calendar month and Korea date cross year and leap boundaries', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthDays('2024-02').filter(Boolean).length, 29);
  assert.equal(monthDays('2026-02').filter(Boolean).length, 28);
  assert.equal(monthDays('2026-09')[0], null);
  assert.equal(koreaToday(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
});

test('ICS preserves all-day ranges, Korean UTC time, escaping and UTF-8 folding', () => {
  const record: ApplicationRecord = { id: 'e608f5c7-70ba-40e4-b225-1272f8d8bbd9', revision: 'e608f5c7-70ba-40e4-b225-1272f8d8bbd8', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', history: [], details: { ...emptyDetails, company: '가나다'.repeat(20), position: '개발', events: [
    { id: 'e608f5c7-70ba-40e4-b225-1272f8d8bbd7', kind: 'deadline', date: '2026-12-31', time: '', title: '마감,확인;필수\nBEGIN:VEVENT', location: '' },
    { id: 'e608f5c7-70ba-40e4-b225-1272f8d8bbd6', kind: 'interview', date: '2027-01-01', time: '00:30', title: '', location: '본사\\2층' },
  ] } };
  const ics = exportCalendar([record], new Date('2026-01-01T00:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(ics, /DTSTART:20261231T153000Z\r\nDTEND:20261231T163000Z/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('마감\\,확인\\;필수\\nBEGIN:VEVENT'));
  assert.equal(ics.split('\r\nBEGIN:VEVENT\r\n').length, 3);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(!exportCalendar([{ ...record, details: { ...record.details, archived: true } }]).includes('BEGIN:VEVENT'));
});
