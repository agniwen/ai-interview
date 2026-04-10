import { z } from 'zod';

export const interviewSessionTurnSchema = z.object({
  id: z.string().min(1),
  eventId: z.number().int().nonnegative().optional(),
  role: z.enum(['agent', 'user']),
  text: z.string().min(1),
  source: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  timeInCallSecs: z.number().int().nonnegative().optional(),
});

export const interviewSessionSyncSchema = z.object({
  conversationId: z.string().min(1),
  status: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  turn: interviewSessionTurnSchema.optional(),
});

export type InterviewSessionSyncInput = z.infer<typeof interviewSessionSyncSchema>;
