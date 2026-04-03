import { z } from 'zod';

export const chatRequestSchema = z.object({
  jobDescription: z.string().optional(),
  messages: z.array(z.any()),
});
