import type { BetterAuthOptions } from "better-auth";
import { getOAuthState } from "better-auth/api";

export const feishuAccountLinking = {
  // Different app open IDs may produce different synthetic emails. Only explicit,
  // session-authenticated OAuth linking is allowed by the validation gate below.
  // Do not disable implicit linking globally: Google retains its default
  // implicit-linking rules, including the local email-verification gate.
  allowDifferentEmails: true,
  enabled: true,
  trustedProviders: ["feishu", "feishu-jiguang-hr"],
  updateUserInfoOnLink: false,
} satisfies NonNullable<NonNullable<BetterAuthOptions["account"]>["accountLinking"]>;

type ValidateUserInfo = NonNullable<NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]>;

export const validateFeishuAccountLinking: ValidateUserInfo = async ({ source, user }) => {
  if (source.action !== "link-account" || source.method !== "oauth") {
    return;
  }
  const providerId = source.oauth?.providerId;
  if (providerId !== "feishu" && providerId !== "feishu-jiguang-hr") {
    return;
  }
  // Better Auth validates the callback state before invoking this gate. Its
  // documented link field is server-generated from the authenticated session,
  // not the callback URL or client-supplied additionalData.
  const state = await getOAuthState();
  if (!state?.link || state.link.userId !== user.id) {
    return {
      error: "account_not_linked",
      errorDescription: "请先登录原账号，再主动关联飞书账号。",
    };
  }
};
