import { z } from 'zod';

export const statusLabels = { interested: '관심 기업', draft: '서류 준비', submitted: '서류 제출', test: '시험 예정', interview: '면접 예정', accepted: '합격', rejected: '불합격', withdrawn: '지원 종료' } as const;
export const eventLabels = { deadline: '서류 마감', test: '시험', interview: '면접', result: '결과 발표', other: '기타' } as const;
export const statusSchema = z.enum(['interested', 'draft', 'submitted', 'test', 'interview', 'accepted', 'rejected', 'withdrawn']);
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const dateSchema = z.string().refine(validDate, '올바른 날짜를 입력해주세요.');
export const eventSchema = z.object({
  id: z.uuid(), kind: z.enum(['deadline', 'test', 'interview', 'result', 'other']), date: dateSchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/), title: z.string().max(160), location: z.string().max(500),
}).strict();
export const detailsSchema = z.object({
  company: z.string().trim().min(1).max(120), position: z.string().trim().max(120),
  sourceUrl: z.string().max(2048).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }, 'http 또는 https 공고 주소를 입력해주세요.'),
  job: z.string().max(16000), question: z.string().max(5000), status: statusSchema,
  appliedOn: z.union([z.literal(''), dateSchema]), notes: z.string().max(12000), answer: z.string().max(20000), archived: z.boolean(),
  events: z.array(eventSchema).max(50).refine(events => new Set(events.map(event => event.id)).size === events.length, '일정 ID가 중복되었습니다.'),
}).strict();
export const historySchema = z.array(z.object({ status: statusSchema, at: z.iso.datetime({ offset: true }) }).strict()).min(1).max(1000);
export const recordSchema = z.object({
  id: z.uuid(), details: detailsSchema, history: historySchema, revision: z.uuid(),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
}).strict();
export const saveApplicationSchema = z.object({ id: z.uuid(), expectedRevision: z.uuid().nullable(), details: detailsSchema }).strict();
export type ApplicationDetails = z.infer<typeof detailsSchema>;
export type ApplicationRecord = z.infer<typeof recordSchema>;
export type ApplicationEvent = z.infer<typeof eventSchema>;
export const emptyDetails: ApplicationDetails = { company: '', position: '', sourceUrl: '', job: '', question: '', status: 'interested', appliedOn: '', notes: '', answer: '', archived: false, events: [] };
