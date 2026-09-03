import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { rpcFetch } from "@/lib/client/api";
import { getServerRpc } from "@/lib/start/server-rpc";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@app/shared/query-client";
import type { ResumeParseCacheFilters } from "@app/shared/resume-parse-cache";
import { z } from "zod";

type ResumeParseCacheGridQuery = DataGridQueryState<ResumeParseCacheFilters>;
const SORT_COLUMNS = ["filename", "size", "parsedAt", "createdAt", "parsedStatus"] as const;

function normalizeSortColumn(value: string | undefined): (typeof SORT_COLUMNS)[number] {
  return SORT_COLUMNS.find((column) => column === value) ?? "parsedAt";
}

function toApiQuery(query: ResumeParseCacheGridQuery) {
  return {
    ...query.filters,
    page: String(query.page),
    pageSize: String(query.pageSize),
    search: query.search || undefined,
    sortBy: normalizeSortColumn(query.sortBy),
    sortOrder: query.sortOrder ?? "desc",
  };
}

export async function loadPlatformResumeParseCacheHydrationState(
  query: ResumeParseCacheGridQuery,
): Promise<JsonValue> {
  const rpc = getServerRpc();
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.platform["resume-parse-cache"].$get({ query: toApiQuery(query) }),
        "加载解析缓存失败",
      ),
    queryKey: buildDataGridQueryKey(["platform-resume-parse-cache"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
