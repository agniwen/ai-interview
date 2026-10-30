import type { BetterAuthOptions } from "better-auth";
import { z } from "zod";
import { validateFeishuAccountLinking } from "./feishu-account-linking";

type ValidateUserInfo = NonNullable<NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]>;
type DatabaseHooks = NonNullable<BetterAuthOptions["databaseHooks"]>;
type AccountAfter = NonNullable<
  NonNullable<NonNullable<DatabaseHooks["account"]>["create"]>["after"]
>;
type UserBefore = NonNullable<NonNullable<NonNullable<DatabaseHooks["user"]>["create"]>["before"]>;

const profileSchema = z.object({
  feishuTenantKey: z.string().trim().min(1),
  feishuTenantName: z.string().trim().min(1).optional(),
  id: z.string().min(1),
});

/** Only validated OAuth profiles may supply these server-owned user fields. */
export function createFeishuTenantProfileHooks() {
  const profiles = new WeakMap<
    object,
    { providerId: string; profile: z.infer<typeof profileSchema> }
  >();

  const validateUserInfo: ValidateUserInfo = async (data, context) => {
    profiles.delete(context.context);
    const rejection = await validateFeishuAccountLinking(data, context);
    if (rejection) {
      return rejection;
    }
    const providerId = data.source.oauth?.providerId;
    if (
      data.source.method !== "oauth" ||
      (providerId !== "feishu" && providerId !== "feishu-jiguang-hr")
    ) {
      return;
    }
    const parsed = profileSchema.safeParse(data.source.oauth?.profile);
    if (parsed.success) {
      profiles.set(context.context, { profile: parsed.data, providerId });
    }
  };

  const beforeUserCreate: UserBefore = (user, context) => {
    const verified = context && profiles.get(context.context);
    return Promise.resolve({
      data: verified
        ? {
            ...user,
            feishuTenantKey: verified.profile.feishuTenantKey,
            feishuTenantName: verified.profile.feishuTenantName ?? null,
          }
        : user,
    });
  };

  // Account hooks run after ownership/link validation, and also on returning
  // sign-ins. Never derive a tenant from the email, invite, or request body.
  const afterAccountSave: AccountAfter = async (account, context) => {
    const verified = context && profiles.get(context.context);
    if (
      !context ||
      !verified ||
      account.providerId !== verified.providerId ||
      account.accountId !== verified.profile.id
    ) {
      return;
    }
    const user = await context.context.internalAdapter.findUserById(account.userId);
    if (!user) {
      return;
    }
    const stored = z
      .object({
        feishuTenantKey: z.string().nullish(),
        feishuTenantName: z.string().nullish(),
      })
      .parse(user);
    const { feishuTenantKey, feishuTenantName } = verified.profile;
    await context.context.internalAdapter.updateUser(account.userId, {
      feishuTenantKey,
      // A failed name lookup must not erase a known name for the same tenant,
      // or carry the previous tenant's name across a tenant change.
      feishuTenantName:
        feishuTenantName ??
        (stored.feishuTenantKey === feishuTenantKey ? (stored.feishuTenantName ?? null) : null),
    });
  };

  return { afterAccountSave, beforeUserCreate, validateUserInfo };
}
