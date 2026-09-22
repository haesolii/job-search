import { z } from 'zod';
import { documentSchema, resultSchema } from './coach.ts';

const mode = z.enum(['draft', 'revise', 'feedback', 'interview']);
export const contextSchema = z.object({ company: z.string().max(120), position: z.string().max(120), mode, limit: z.number().int().min(100).max(5000) }).strict();
export const snapshotSchema = z.object({
  form: contextSchema.extend({
    question: z.string().max(5000), experience: z.string().max(24000), job: z.string().max(16000), draft: z.string().max(16000),
    documents: z.array(documentSchema).max(5), previous: z.string().max(20000), followup: z.string().max(12000),
  }).strict(),
  result: resultSchema.nullable(), resultContext: contextSchema,
  followup: z.string().max(12000), step: z.number().int().min(0).max(2),
}).strict().refine(value => value.step !== 2 || value.result !== null, '결과가 없는 작업입니다.');
export type Snapshot = z.infer<typeof snapshotSchema>;
export const saveSchema = z.object({ snapshot: snapshotSchema, expectedRevision: z.uuid().nullable() }).strict();
export const deleteSchema = z.object({ expectedRevision: z.uuid() }).strict();
