"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { getQueryClient } from "@/lib/client/query-client";

export function QueryProvider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: ReturnType<typeof getQueryClient>;
}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
