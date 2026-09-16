import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";

const feishuProviderIdSchema = z.enum(["feishu", "feishu-jiguang-hr"]);
const authConfigSchema = z.object({
  feishuLoginProviderIds: z.array(feishuProviderIdSchema).min(1),
});

export type FeishuLoginProviderId = z.infer<typeof feishuProviderIdSchema>;

const DEFAULT_FEISHU_LOGIN_PROVIDER_IDS = ["feishu-jiguang-hr"] satisfies FeishuLoginProviderId[];

async function loadFeishuLoginProviderIds(): Promise<FeishuLoginProviderId[]> {
  try {
    const payload = await apiJson<unknown>(apiUrl("/api/public/auth-config"), "登录配置读取失败。");
    return authConfigSchema.parse(payload).feishuLoginProviderIds;
  } catch {
    return DEFAULT_FEISHU_LOGIN_PROVIDER_IDS;
  }
}

export function useFeishuLoginProviderIds(): FeishuLoginProviderId[] {
  const query = useQuery({
    placeholderData: { feishuLoginProviderIds: DEFAULT_FEISHU_LOGIN_PROVIDER_IDS },
    queryFn: async () => ({ feishuLoginProviderIds: await loadFeishuLoginProviderIds() }),
    queryKey: ["public-auth-config"],
    staleTime: 5 * 60 * 1000,
  });
  return query.data?.feishuLoginProviderIds ?? DEFAULT_FEISHU_LOGIN_PROVIDER_IDS;
}
