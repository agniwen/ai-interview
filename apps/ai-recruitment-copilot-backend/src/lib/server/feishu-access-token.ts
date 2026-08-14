interface FeishuTenantTokenResponse {
  code: number;
  expire?: number;
  msg: string;
  tenant_access_token?: string;
}

const tenantTokenCache = new Map<string, { expiresAt: number; token: string }>();

export async function getFeishuTenantAccessToken(
  appId: string,
  appSecret: string,
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
    },
  );
  const result = (await response.json()) as FeishuTenantTokenResponse;
  if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
    throw new Error(
      `Feishu tenant token request failed: ${result.code || response.status} ${result.msg || ""}`,
    );
  }

  tenantTokenCache.set(appId, {
    expiresAt: now + (result.expire ?? 7200) * 1000,
    token: result.tenant_access_token,
  });
  return result.tenant_access_token;
}
