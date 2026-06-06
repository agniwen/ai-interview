import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { FetchQueryOptions, QueryKey } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/shared/query-client";

type PrefetchQueryOptions = FetchQueryOptions<unknown, Error, unknown, QueryKey>;

export async function QueryHydrationBoundary({
  children,
  queries,
}: {
  children: ReactNode;
  queries: PrefetchQueryOptions[];
}) {
  const queryClient = createQueryClient();

  await Promise.all(queries.map((query) => queryClient.prefetchQuery(query)));

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
