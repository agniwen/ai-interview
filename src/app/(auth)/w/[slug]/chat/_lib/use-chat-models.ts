"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchChatModels } from "@/lib/client/api";

const QUERY_KEY = ["chat", "models"] as const;

/**
 * 拉取 composer 模型选择器需要的可用模型列表，缓存 5 分钟。
 * Fetch the composer's model picker options; cached for 5 minutes.
 */
export function useChatModelsQuery() {
  return useQuery({
    queryFn: fetchChatModels,
    queryKey: QUERY_KEY,
    staleTime: 5 * 60_000,
  });
}
