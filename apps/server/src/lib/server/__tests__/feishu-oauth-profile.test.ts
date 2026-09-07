import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth";

afterEach(() => vi.unstubAllGlobals());

describe("Feishu OAuth profile persistence", () => {
  it.each(["feishu", "feishu-jiguang-hr"])(
    "%s preserves tenant fields through Better Auth's provider mapping",
    async (providerId) => {
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) => {
          const url = String(input);
          if (url.endsWith("/tenant_access_token/internal")) {
            return Promise.resolve(Response.json({ code: 0, tenant_access_token: "test-token" }));
          }
          if (url.endsWith("/tenant/query")) {
            return Promise.resolve(
              Response.json({ code: 0, data: { tenant: { name: "测试企业" } } }),
            );
          }
          if (url.endsWith("/user_info")) {
            return Promise.resolve(
              Response.json({
                code: 0,
                data: {
                  email: "test@example.com",
                  name: "测试用户",
                  open_id: "test-open-id",
                  tenant_key: "test-tenant",
                },
              }),
            );
          }
          throw new Error(`Unexpected fetch: ${url}`);
        }),
      );
      const context = await auth.$context;
      const provider = context.socialProviders.find((item) => item.id === providerId);
      expect(provider).toBeDefined();
      const profile = await provider?.getUserInfo({ accessToken: "test-user-token" });
      expect(profile?.user).toMatchObject({
        feishuTenantKey: "test-tenant",
        feishuTenantName: "测试企业",
      });
    },
  );
});
