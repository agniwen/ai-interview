import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { queryPaginatedResumeParseCache } from "@app/server/server/routes/platform/routes/resume-parse-cache/dao";
import type {
  ResumeParseCacheFilters,
  ResumeParseCacheQuery,
} from "@app/server/server/routes/platform/routes/resume-parse-cache/schema";
import { z } from "zod";

type ResumeParseCacheGridQuery = DataGridQueryState<ResumeParseCacheFilters>;

function toBackendQuery(query: ResumeParseCacheGridQuery): ResumeParseCacheQuery {
  const sortBy =
    query.sortBy === "filename" ||
    query.sortBy === "size" ||
    query.sortBy === "createdAt" ||
    query.sortBy === "parsedStatus"
      ? query.sortBy
      : "parsedAt";
  return {
    ...query.filters,
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    sortBy,
    sortOrder: query.sortOrder ?? "desc",
  };
}

export async function loadPlatformResumeParseCacheHydrationState(
  query: ResumeParseCacheGridQuery,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () => queryPaginatedResumeParseCache(toBackendQuery(query)),
    queryKey: buildDataGridQueryKey(["platform-resume-parse-cache"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
