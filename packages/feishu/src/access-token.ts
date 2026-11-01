import { z } from "zod";

const feishuTenantTokenResponseSchema = z.object({
  code: z.number(),
  expire: z.number().optional(),
  msg: z.string().optional(),
  tenant_access_token: z.string().optional(),
});

const tenantTokenCache = new Map<string, { expiresAt: number; token: string }>();

export async function getFeishuTenantAccessToken(
  appId: string,
  appSecret: string,
  signal?: AbortSignal,
): Promise<string> {
  const now = Date.now();
  const cached = tenantTokenCache.get(appId);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
      signal,
    },
  );
  const parsed = feishuTenantTokenResponseSchema.safeParse(await response.json());
  const result = parsed.success ? parsed.data : null;
  if (!result || !response.ok || result.code !== 0 || !result.tenant_access_token) {
    const code = result?.code ?? response.status;
    const message = result?.msg ?? "Invalid response payload";
    throw new Error(`Feishu tenant token request failed: ${code || response.status} ${message}`);
  }
  const token = result.tenant_access_token;

  tenantTokenCache.set(appId, {
    expiresAt: now + (result.expire ?? 7200) * 1000,
    token,
  });
  return token;
}
