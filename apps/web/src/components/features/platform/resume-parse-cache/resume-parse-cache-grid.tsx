"use client";

import { listTextQuery } from "@app/shared/list-text-filters";

import { IconDatabase } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { runAsyncAction } from "@/lib/client/async-control";
import {
  ActionsColumnHeader,
  TABLE_ACTION_BUTTON_CLASS,
  customColumn,
  DataGrid,
  dateColumn,
  estimateActionsColumnSize,
  useDataGridState,
} from "@/components/features/data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import type { ResumeParseCacheFilters } from "@app/server/web/platform";
import type { AttachmentTextSource } from "@app/db-schema/db-enums";
import { formatBytes } from "@app/shared/utils/format";

export interface ResumeParseCacheRecord {
  contentHash: string;
  createdAt: string;
  filename: string;
  hasStructured: boolean;
  hasText: boolean;
  id: string;
  mediaType: string;
  organizationName: string;
  parsedAt: string | null;
  parsedPageCount: number | null;
  parsedStatus: "failed" | "pending" | "ready";
  parsedTextSource: AttachmentTextSource | null;
  size: number;
  storageKey: string;
  userEmail: string;
  userName: string;
}

export interface ResumeParseCacheResult {
  page: number;
  pageSize: number;
  records: ResumeParseCacheRecord[];
  total: number;
  totalPages: number;
}

export interface ResumeParseCacheDetail {
  contentHash: string | null;
  createdAt: string;
  filename: string;
  id: string;
  mediaType: string;
  parsedAt: string | null;
  parsedError: string | null;
  parsedPageCount: number | null;
  parsedStatus: "failed" | "pending" | "ready";
  parsedStructured: unknown;
  parsedText: string | null;
  parsedTextSource: ResumeParseCacheRecord["parsedTextSource"];
  size: number;
  storageKey: string;
}

type ResumeParseCacheSortColumn = "createdAt" | "filename" | "parsedAt" | "parsedStatus" | "size";

export interface ResumeParseCacheQuery {
  cacheType: ResumeParseCacheFilters["cacheType"];
  page: string;
  pageSize: string;
  parsedStatus: ResumeParseCacheFilters["parsedStatus"];
  search?: string;
  sortBy: ResumeParseCacheSortColumn;
  sortOrder: "asc" | "desc";
  textSource: ResumeParseCacheFilters["textSource"];
}

const INITIAL_FILTERS: ResumeParseCacheFilters = {
  cacheType: "all",
  parsedStatus: "all",
  textSource: "all",
};

const ACTION_COLUMN_SIZE = estimateActionsColumnSize({
  inlineLabels: ["查看", "删除"],
});

const STATUS_META = {
  failed: { label: "失败", variant: "destructive" },
  pending: { label: "待解析", variant: "outline" },
  ready: { label: "可复用", variant: "secondary" },
} as const;

const TEXT_SOURCE_LABEL = {
  "aliyun-docmining": "阿里云文档挖掘",
  "docx-text": "DOCX 文本",
  "html-text": "HTML 文本",
  "pdf-parse": "PDF 文本",
  "pptx-text": "PPTX 文本",
  "qwen-ocr": "Qwen OCR",
  "qwen3.5-ocr": "Qwen3.5 OCR（历史）",
  "xlsx-text": "XLSX 文本",
} as const satisfies Record<NonNullable<ResumeParseCacheRecord["parsedTextSource"]>, string>;

export interface ResumeParseCacheDependencies {
  deleteCache: (contentHash: string) => Promise<{ clearedCount: number }>;
  fetchCache: (query: ResumeParseCacheQuery) => Promise<ResumeParseCacheResult>;
  fetchDetail: (contentHash: string) => Promise<ResumeParseCacheDetail>;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
}

const defaultResumeParseCacheDependencies: ResumeParseCacheDependencies = {
  deleteCache: (contentHash) =>
    rpcFetch(
      rpc.api.platform["resume-parse-cache"][":hash"].$delete({
        param: { hash: contentHash },
      }),
      "删除解析缓存失败",
    ),
  fetchCache: (query) =>
    rpcFetch(rpc.api.platform["resume-parse-cache"].$get({ query }), "加载解析缓存失败"),
  fetchDetail: (contentHash) =>
    rpcFetch(
      rpc.api.platform["resume-parse-cache"][":hash"].$get({
        param: { hash: contentHash },
      }),
      "加载缓存 JSON 失败",
    ),
  notifyError: (message) => toast.error(message),
  notifySuccess: (message) => toast.success(message),
};

function isResumeParseCacheSortColumn(sortBy: string): sortBy is ResumeParseCacheSortColumn {
  return ["createdAt", "filename", "parsedAt", "parsedStatus", "size"].some(
    (column) => column === sortBy,
  );
}

const FILTERS = [
  { key: "textFilters" as const, resource: "parseCache" as const, type: "text-filters" as const },
  {
    key: "cacheType",
    options: [
      { label: "全部缓存", value: "all" },
      { label: "包含结构化 JSON", value: "structured" },
      { label: "仅 OCR 文本", value: "text_only" },
    ],
    placeholder: "缓存内容",
    type: "select" as const,
    unfilteredValue: "all",
  },
  {
    key: "parsedStatus",
    options: [
      { label: "全部状态", value: "all" },
      { label: "可复用", value: "ready" },
      { label: "待解析", value: "pending" },
      { label: "失败", value: "failed" },
    ],
    placeholder: "解析状态",
    type: "select" as const,
    unfilteredValue: "all",
  },
  {
    key: "textSource",
    options: [
      { label: "全部来源", value: "all" },
      ...Object.entries(TEXT_SOURCE_LABEL).map(([value, label]) => ({ label, value })),
    ],
    placeholder: "文本来源",
    type: "select" as const,
    unfilteredValue: "all",
  },
];

function CacheJsonDialog({
  dependencies,
  onOpenChange,
  record,
}: {
  dependencies: ResumeParseCacheDependencies;
  onOpenChange: (open: boolean) => void;
  record: ResumeParseCacheRecord | null;
}) {
  const detailQuery = useQuery({
    enabled: Boolean(record),
    queryFn: () => dependencies.fetchDetail(record?.contentHash ?? ""),
    queryKey: ["platform-resume-parse-cache-detail", record?.id],
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(record)}>
      <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>解析缓存 JSON</DialogTitle>
          <DialogDescription>{record?.filename ?? "查看缓存内容"}</DialogDescription>
        </DialogHeader>
        {detailQuery.isPending ? <Skeleton className="h-96 w-full" /> : null}
        {detailQuery.isError ? (
          <p className="text-destructive text-sm">{detailQuery.error.message}</p>
        ) : null}
        {detailQuery.data ? (
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(detailQuery.data, null, 2)}
          </pre>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteCachePopover({
  deleting,
  onDelete,
  record,
}: {
  deleting: boolean;
  onDelete: (record: ResumeParseCacheRecord) => Promise<boolean>;
  record: ResumeParseCacheRecord;
}) {
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const deleted = await onDelete(record);
    if (deleted) {
      setOpen(false);
    }
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className={TABLE_ACTION_BUTTON_CLASS} size="sm" type="button" variant="text">
            删除
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>确定删除这份解析缓存？</PopoverTitle>
          <PopoverDescription>
            将清空同一文件 Hash 的 OCR 文本和结构化 JSON；附件记录和文件本身会保留。
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)} size="sm" type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={deleting}
            onClick={handleDelete}
            size="sm"
            type="button"
            variant="destructive"
          >
            确认删除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ResumeParseCacheGrid({
  dependencies = defaultResumeParseCacheDependencies,
}: {
  dependencies?: ResumeParseCacheDependencies;
}) {
  const [viewTarget, setViewTarget] = useState<ResumeParseCacheRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCache = useCallback(
    (params: {
      filters: ResumeParseCacheFilters;
      page: number;
      pageSize: number;
      search: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }): Promise<ResumeParseCacheResult> => {
      const query: ResumeParseCacheQuery = {
        ...listTextQuery(params),
        cacheType: params.filters.cacheType,
        page: String(params.page),
        pageSize: String(params.pageSize),
        parsedStatus: params.filters.parsedStatus,
        sortBy:
          params.sortBy && isResumeParseCacheSortColumn(params.sortBy) ? params.sortBy : "parsedAt",
        sortOrder: params.sortOrder ?? "desc",
        textSource: params.filters.textSource,
      };
      if (params.search) {
        query.search = params.search;
      }
      return dependencies.fetchCache(query);
    },
    [dependencies],
  );

  const grid = useDataGridState<ResumeParseCacheRecord, ResumeParseCacheFilters>({
    allowedSortIds: ["filename", "size", "parsedAt", "createdAt", "parsedStatus"],
    defaultPageSize: 10,
    defaultSorting: [{ desc: true, id: "parsedAt" }],
    initialFilters: INITIAL_FILTERS,
    queryFn: fetchCache,
    queryKeyBase: ["platform-resume-parse-cache"],
  });

  const deleteCache = useCallback(
    async (record: ResumeParseCacheRecord) => {
      setDeletingId(record.id);
      const result = await runAsyncAction({
        cleanup: () => setDeletingId(null),
        onError: (error) =>
          dependencies.notifyError(error instanceof Error ? error.message : "删除解析缓存失败"),
        operation: async () => {
          const response = await dependencies.deleteCache(record.contentHash);
          dependencies.notifySuccess(`缓存已删除，${response.clearedCount} 条同 Hash 记录已失效`);
          grid.invalidate();
        },
      });
      return result.ok;
    },
    [dependencies, grid],
  );

  const columns = useMemo(
    () => [
      customColumn<ResumeParseCacheRecord>({
        accessorKey: "filename",
        cell: (record) => (
          <div className="min-w-0 max-w-72">
            <p className="truncate font-medium">{record.filename}</p>
            <p
              className="truncate font-mono text-muted-foreground text-xs"
              title={record.contentHash ?? ""}
            >
              {record.contentHash ?? "无 Hash"}
            </p>
          </div>
        ),
        enableSorting: true,
        key: "filename",
        title: "文件 / Hash",
      }),
      customColumn<ResumeParseCacheRecord>({
        cell: (record) => (
          <div className="flex flex-wrap gap-1">
            {record.hasStructured ? <Badge variant="secondary">结构化 JSON</Badge> : null}
            {record.hasText ? <Badge variant="outline">OCR 文本</Badge> : null}
          </div>
        ),
        key: "cacheType",
        title: "缓存内容",
      }),
      customColumn<ResumeParseCacheRecord>({
        accessorKey: "parsedStatus",
        cell: (record) => {
          const meta = STATUS_META[record.parsedStatus];
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
        enableSorting: true,
        key: "parsedStatus",
        title: "状态",
      }),
      customColumn<ResumeParseCacheRecord>({
        cell: (record) => (
          <div>
            <p>{record.parsedTextSource ? TEXT_SOURCE_LABEL[record.parsedTextSource] : "—"}</p>
            <p className="text-muted-foreground text-xs">
              {record.parsedPageCount ? `${record.parsedPageCount} 页` : "页数未知"}
            </p>
          </div>
        ),
        key: "source",
        title: "文本来源",
      }),
      customColumn<ResumeParseCacheRecord>({
        accessorKey: "size",
        cell: (record) => formatBytes(record.size),
        enableSorting: true,
        key: "size",
        title: "文件大小",
      }),
      customColumn<ResumeParseCacheRecord>({
        cell: (record) => (
          <div className="min-w-0 max-w-52">
            <p className="truncate">{record.userName || record.userEmail}</p>
            <p className="truncate text-muted-foreground text-xs">{record.organizationName}</p>
          </div>
        ),
        key: "owner",
        title: "用户 / 工作区",
      }),
      dateColumn<ResumeParseCacheRecord>({
        emptyText: "—",
        key: "parsedAt",
        sortable: true,
        title: "解析时间",
      }),
      customColumn<ResumeParseCacheRecord>({
        cell: (record) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              className={TABLE_ACTION_BUTTON_CLASS}
              onClick={() => setViewTarget(record)}
              size="sm"
              type="button"
              variant="text"
            >
              查看
            </Button>
            <DeleteCachePopover
              deleting={deletingId === record.id}
              onDelete={deleteCache}
              record={record}
            />
          </div>
        ),
        key: "actions",
        size: ACTION_COLUMN_SIZE,
        title: () => <ActionsColumnHeader>操作</ActionsColumnHeader>,
      }),
    ],
    [deleteCache, deletingId],
  );

  return (
    <>
      <DataGrid<ResumeParseCacheRecord>
        {...grid.bind}
        columnPinning={{ end: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconDatabase />
              </EmptyMedia>
              <EmptyTitle>没有解析缓存</EmptyTitle>
            </EmptyHeader>
          </Empty>
        }
        filters={FILTERS}
        getRowId={(record) => record.id}
      />
      <CacheJsonDialog
        dependencies={dependencies}
        onOpenChange={(open) => !open && setViewTarget(null)}
        record={viewTarget}
      />
    </>
  );
}
