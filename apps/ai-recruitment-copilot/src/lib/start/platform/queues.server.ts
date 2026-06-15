import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import {
  getResumeParseQueueOverview,
  listResumeParseQueueJobs,
  RESUME_PARSE_JOB_LIST_STATES,
  RESUME_PARSE_QUEUE_NAME,
} from "@arc/resume-parse-queue/resume-parse";
import type { ResumeParseJobListState } from "@arc/resume-parse-queue/resume-parse";

export interface PlatformQueueFilters extends Record<string, string> {
  queue: string;
  state: string;
}

function normalizeJobState(value: string): ResumeParseJobListState {
  return RESUME_PARSE_JOB_LIST_STATES.includes(value as ResumeParseJobListState)
    ? (value as ResumeParseJobListState)
    : "all";
}

export async function listPlatformQueuesOverview() {
  const overview = await getResumeParseQueueOverview();
  return { records: [overview], total: 1 };
}

export async function listPlatformQueueJobs(query: DataGridQueryState<PlatformQueueFilters>) {
  if (query.filters.queue !== RESUME_PARSE_QUEUE_NAME) {
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: [],
      state: normalizeJobState(query.filters.state),
      total: 0,
      totalPages: 0,
    };
  }

  return await listResumeParseQueueJobs({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    state: normalizeJobState(query.filters.state),
  });
}

export async function loadPlatformQueuesHydrationState(
  query: DataGridQueryState<PlatformQueueFilters>,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryFn: () => listPlatformQueuesOverview(),
      queryKey: ["platform-queues"],
    }),
    queryClient.prefetchQuery({
      queryFn: () => listPlatformQueueJobs(query),
      queryKey: buildDataGridQueryKey(["platform-queue-jobs"], query),
    }),
  ]);

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
