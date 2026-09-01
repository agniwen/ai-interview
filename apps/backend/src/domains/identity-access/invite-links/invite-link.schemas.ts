import { z } from "zod";

export const inviteLinkWorkspacePathSchema = z.object({ slug: z.string().trim().min(1) });
export const inviteLinkPathSchema = inviteLinkWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const inviteLinkInitialRoleSchema = z.object({ initialRole: z.string().trim().min(1) });
export const inviteLinkCreateSchema = inviteLinkInitialRoleSchema.extend({
  email: z.email().trim().toLowerCase().max(200).optional(),
});
export const inviteLinkSchema = z.object({
  code: z.string(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  creatorName: z.string().nullable().optional(),
  disabledAt: z.iso.datetime().nullable(),
  disabledBy: z.string().nullable(),
  id: z.string(),
  initialRole: z.string(),
  joinedCount: z.number().int().nonnegative().optional(),
  organizationId: z.string(),
});
export const inviteLinkListSchema = z.object({ links: z.array(inviteLinkSchema) });
export const inviteLinkCreatedSchema = inviteLinkSchema.extend({
  emailDelivery: z.enum(["failed", "not_requested", "sent"]),
});
export const inviteLinkMembersSchema = z.object({
  members: z.array(
    z.object({
      email: z.email(),
      joinedAt: z.iso.datetime(),
      name: z.string(),
      userId: z.string(),
    }),
  ),
});
