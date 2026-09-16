import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { publicRpc } from "./rpc";

const feishuProviderIdSchema = z.enum(["feishu", "feishu-jiguang-hr"]);
const authConfigSchema = z.object({
  feishuLoginProviderIds: z.array(feishuProviderIdSchema).min(1),
});

export type FeishuLoginProviderId = z.infer<typeof feishuProviderIdSchema>;

const DEFAULT_FEISHU_LOGIN_PROVIDER_IDS = ["feishu-jiguang-hr"] satisfies FeishuLoginProviderId[];

async function loadFeishuLoginProviderIds(): Promise<FeishuLoginProviderId[]> {
  try {
    const response = await publicRpc["auth-config"].$get();
    if (!response.ok) {
      return DEFAULT_FEISHU_LOGIN_PROVIDER_IDS;
    }
    return authConfigSchema.parse(await response.json()).feishuLoginProviderIds;
  } catch {
    // Fail closed: an unavailable or older backend must not re-expose the legacy login.
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
