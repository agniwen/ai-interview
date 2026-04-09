import { z } from 'zod';

export const chatRequestSchema = z.object({
  enableThinking: z.boolean().optional(),
  jobDescription: z.string().optional(),
  messages: z.array(z.any()),
});
