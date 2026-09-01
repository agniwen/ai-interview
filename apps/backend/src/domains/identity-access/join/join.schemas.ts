import { z } from "zod";

export const joinCodeSchema = z.string().regex(/^[0-9A-Za-z]{16}$/u, "邀请码格式不正确。");

export const joinPreviewResponseSchema = z.object({
  alreadyMember: z.boolean().optional(),
  initialRole: z.string().optional(),
  valid: z.boolean(),
  workspace: z
    .object({
      id: z.string(),
      logo: z.string().nullable(),
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
});

export const joinAcceptResponseSchema = z.object({
  organizationId: z.string(),
  organizationSlug: z.string(),
  role: z.string(),
  status: z.enum(["joined", "already_member"]),
});
