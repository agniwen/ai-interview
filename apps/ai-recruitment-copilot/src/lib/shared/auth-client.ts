import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/server/auth";
import { ac, roles } from "@/lib/shared/permissions";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000")
      : window.location.origin,
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
