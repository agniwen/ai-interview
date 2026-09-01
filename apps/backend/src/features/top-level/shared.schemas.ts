import { z } from "zod";

export const identifierSchema = z.string().trim().min(1);
export const okResponseSchema = z.object({ ok: z.literal(true) });
export const successResponseSchema = z.object({ success: z.literal(true) });
