import { z } from "zod";

export const invitationResponseSchema = z.object({
  action: z.enum(["accept", "decline"]),
  declineReason: z.string().trim().max(500).nullable().optional(),
});

export const publicRoundResolveQuerySchema = z.object({
  id: z.string().trim().min(1),
});

export const publicRoundResolveResponseSchema = z.object({ roundId: z.string() });
