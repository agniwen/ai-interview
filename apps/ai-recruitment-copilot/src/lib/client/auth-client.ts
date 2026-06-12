import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { ac, roles } from "@arc/shared/permissions";
import { env } from "@/env/client";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    adminClient(),
    genericOAuthClient(),
    inferAdditionalFields<typeof auth>(),
    // 客户端用同一份 ac+roles，使 authClient.organization.checkRolePermission
    // 在浏览器里同步本地解析（不发请求）。
    // Client uses the same ac+roles so checkRolePermission resolves locally,
    // no network round trip for UI gating.
    organizationClient({ ac, roles }),
  ],
});
