import { z } from "zod";

export const workspaceUpdateSchema = z.object({
  name: z.string().trim().min(1, "请输入工作区名称。").max(80),
});
export const recruitingGroupInputSchema = z.object({
  name: z.string().trim().min(1, "请输入组别名称。").max(40),
});
export const recruitingGroupRoleSchema = z.enum([
  "recruitingSupervisor",
  "recruitingLead",
  "hr",
  "viewer",
]);
export const recruitingGroupMemberInputSchema = z.object({
  role: recruitingGroupRoleSchema,
  userId: z.string().trim().min(1),
});
export const recruitingGroupMemberRoleInputSchema = z.object({ role: recruitingGroupRoleSchema });
export const groupPathSchema = z.object({ id: z.string().min(1), slug: z.string().min(1) });
export const groupMemberPathSchema = groupPathSchema.extend({ userId: z.string().min(1) });
export const memberPathSchema = z.object({ slug: z.string().min(1), userId: z.string().min(1) });

export const groupMemberSchema = z.object({
  email: z.string(),
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
  role: recruitingGroupRoleSchema.nullable(),
  userId: z.string(),
});
export const groupSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string(),
  isDefault: z.boolean(),
  isVirtual: z.boolean().optional(),
  memberUserIds: z.array(z.string()),
  members: z.array(groupMemberSchema),
  name: z.string(),
});
export const groupsResponseSchema = z.object({ groups: z.array(groupSchema) });
export const createdGroupResponseSchema = groupSchema.omit({ isVirtual: true });
export const mutationResponseSchema = z.object({
  id: z.string().optional(),
  success: z.literal(true),
});
export const activityResponseSchema = z.object({
  dailyAdded: z.array(z.object({ count: z.number().int().nonnegative(), day: z.string() })),
});
export const lastActivesResponseSchema = z.object({
  records: z.array(z.object({ lastActiveAt: z.iso.datetime().nullable(), userId: z.string() })),
});
export const deprecatedResponseSchema = z.object({ error: z.string() });
export const workspaceResponseSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string(),
  logo: z.string().nullable(),
  metadata: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
});
