import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { rpcFetch } from "@/lib/client/api";
import { getServerRpc } from "@/lib/start/server-rpc";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@app/shared/query-client";
import { z } from "zod";

export interface PlatformQueueFilters extends Record<string, string> {
  parseStatus: string;
  queue: string;
  state: string;
  uploadStatus: string;
}

const JOB_STATES = [
  "all",
  "waiting",
  "active",
  "delayed",
  "failed",
  "completed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;
const PARSE_STATUSES = ["all", "queued", "unparsed", "processing", "ready", "failed"] as const;
const UPLOAD_STATUSES = [
  "all",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "duplicate_skipped",
  "cancelled",
] as const;

function normalizeJobState(value: string): (typeof JOB_STATES)[number] {
  return JOB_STATES.find((state) => state === value) ?? "all";
}

function normalizeParseStatus(value: string): (typeof PARSE_STATUSES)[number] {
  return PARSE_STATUSES.find((status) => status === value) ?? "all";
}

function normalizeUploadStatus(value: string): (typeof UPLOAD_STATUSES)[number] {
  return UPLOAD_STATUSES.find((status) => status === value) ?? "all";
}

export async function loadPlatformQueuesHydrationState(
  query: DataGridQueryState<PlatformQueueFilters>,
): Promise<JsonValue> {
  const rpc = getServerRpc();
  const queryClient = createQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryFn: () => rpcFetch(rpc.api.platform.queues.$get(), "加载队列概览失败"),
      queryKey: ["platform-queues"],
    }),
    queryClient.prefetchQuery({
      queryFn: () =>
        rpcFetch(
          rpc.api.platform.queues[":queueName"].jobs.$get({
            param: { queueName: query.filters.queue },
            query: {
              page: String(query.page),
              pageSize: String(query.pageSize),
              parseStatus: normalizeParseStatus(query.filters.parseStatus),
              search: query.search || undefined,
              state: normalizeJobState(query.filters.state),
              uploadStatus: normalizeUploadStatus(query.filters.uploadStatus),
            },
          }),
          "加载队列任务失败",
        ),
      queryKey: buildDataGridQueryKey(["platform-queue-jobs"], query),
    }),
  ]);

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
