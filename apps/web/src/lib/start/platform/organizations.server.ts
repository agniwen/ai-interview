import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { rpcFetch } from "@/lib/client/api";
import { getServerRpc } from "@/lib/start/server-rpc";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@app/shared/query-client";
import { z } from "zod";

type EmptyFilters = Record<string, never>;

const SORT_COLUMNS = ["name", "slug", "createdAt", "memberCount"] as const;

function normalizeSortColumn(value: string | undefined): (typeof SORT_COLUMNS)[number] {
  return SORT_COLUMNS.find((column) => column === value) ?? "createdAt";
}

export async function loadPlatformOrganizationsHydrationState(
  query: DataGridQueryState<EmptyFilters>,
): Promise<JsonValue> {
  const rpc = getServerRpc();
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.platform.organizations.$get({
          query: {
            page: String(query.page),
            pageSize: String(query.pageSize),
            search: query.search || undefined,
            sortBy: normalizeSortColumn(query.sortBy),
            sortOrder: query.sortOrder ?? "desc",
          },
        }),
        "加载工作区列表失败",
      ),
    queryKey: buildDataGridQueryKey(["platform-organizations"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
