import test from 'node:test';
import assert from 'node:assert/strict';
import { detailsSchema, emptyDetails, recordSchema, saveApplicationSchema, validDate } from './applications.ts';

const id = 'd150041a-f994-4fd7-8f73-bfa64bb37f52';
const details = () => ({ ...emptyDetails, company: '테스트 회사', events: [{ id, kind: 'interview' as const, date: '2028-02-29', time: '09:30', title: '첫 면접', location: '서울' }] });
test('calendar dates reject impossible days, accept leap day and end of year', () => {
  for (const value of ['2027-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', '']) assert.equal(validDate(value), false, value);
  for (const value of ['2028-02-29', '2026-12-31', '2027-01-01']) assert.equal(validDate(value), true, value);
});
test('application event IDs, time, limits, and dates enforce persistent calendar validity', () => {
  assert.equal(detailsSchema.safeParse(details()).success, true);
  for (const patch of [{ time: '24:00' }, { time: '09:60' }, { date: '2027-02-29' }]) assert.equal(detailsSchema.safeParse({ ...details(), events: [{ ...details().events[0], ...patch }] }).success, false);
  assert.equal(detailsSchema.safeParse({ ...details(), events: [...details().events, ...details().events] }).success, false);
  assert.equal(detailsSchema.safeParse({ ...details(), appliedOn: '2026-02-30' }).success, false);
  assert.equal(detailsSchema.safeParse({ ...details(), answer: 'x'.repeat(20001) }).success, false);
});
test('save boundary rejects injected history, ownership, secrets and unsafe source links', () => {
  const save = { id, expectedRevision: null, details: details() };
  assert.equal(saveApplicationSchema.safeParse(save).success, true);
  for (const extra of [{ user_id: id }, { history: [] }, { apiKey: 'secret' }]) assert.equal(saveApplicationSchema.safeParse({ ...save, ...extra }).success, false);
  for (const sourceUrl of ['javascript:alert(1)', 'file:///local', 'https://user:secret@example.com']) assert.equal(detailsSchema.safeParse({ ...details(), sourceUrl }).success, false);
  assert.equal(detailsSchema.safeParse({ ...details(), company: '   ' }).success, false);
});
test('record validates returned history and revisions without admitting database owner fields', () => {
  const record = { id, details: details(), history: [{ status: 'interested', at: '2026-09-22T10:00:00+00:00' }], revision: id, created_at: '2026-09-22T10:00:00+00:00', updated_at: '2026-09-22T10:00:00Z' };
  assert.equal(recordSchema.safeParse(record).success, true);
  assert.equal(recordSchema.safeParse({ ...record, history: [] }).success, false);
  assert.equal(recordSchema.safeParse({ ...record, user_id: id }).success, false);
});
