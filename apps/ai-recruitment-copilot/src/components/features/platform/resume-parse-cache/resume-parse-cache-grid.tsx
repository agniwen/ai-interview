"use client";

import { IconDatabase } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { runAsyncAction } from "@/lib/client/async-control";
import {
  customColumn,
  DataGrid,
  dateColumn,
  estimateActionsColumnSize,
  useDataGridState,
} from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import type { ResumeParseCacheFilters } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/routes/resume-parse-cache/schema";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import { formatBytes } from "@arc/shared/utils/format";

interface ResumeParseCacheRecord {
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

interface ResumeParseCacheResult {
  page: number;
  pageSize: number;
  records: ResumeParseCacheRecord[];
  total: number;
  totalPages: number;
}

interface ResumeParseCacheDetail {
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

const TEXT_SOURCE_LABEL: Record<NonNullable<ResumeParseCacheRecord["parsedTextSource"]>, string> = {
  "aliyun-docmining": "阿里云文档挖掘",
  "docx-text": "DOCX 文本",
  "html-text": "HTML 文本",
  "pdf-parse": "PDF 文本",
  "pptx-text": "PPTX 文本",
  "qwen-ocr": "Qwen OCR",
  "qwen3.5-ocr": "Qwen3.5 OCR",
  "xlsx-text": "XLSX 文本",
};

const FILTERS = [
  {
    key: "search",
    minWidth: "20rem",
    placeholder: "搜索文件名、Hash、用户或工作区",
    type: "search" as const,
  },
  {
    key: "cacheType",
    options: [
      { label: "全部缓存", value: "all" },
      { label: "包含结构化 JSON", value: "structured" },
      { label: "仅 OCR 文本", value: "text_only" },
    ],
    placeholder: "缓存内容",
    type: "select" as const,
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
  },
  {
    key: "textSource",
    options: [
      { label: "全部来源", value: "all" },
      ...Object.entries(TEXT_SOURCE_LABEL).map(([value, label]) => ({ label, value })),
    ],
    placeholder: "文本来源",
    type: "select" as const,
  },
];

function CacheJsonDialog({
  onOpenChange,
  record,
}: {
  onOpenChange: (open: boolean) => void;
  record: ResumeParseCacheRecord | null;
}) {
  const detailQuery = useQuery({
    enabled: Boolean(record),
    queryFn: () =>
      rpcFetch<ResumeParseCacheDetail>(
        rpc.api.platform["resume-parse-cache"][":hash"].$get({
          param: { hash: record?.contentHash ?? "" },
        }),
        "加载缓存 JSON 失败",
      ),
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
          <Button className="h-8 pl-2.5 pr-0 text-xs" size="sm" type="button" variant="text">
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
            onClick={() => void handleDelete()}
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

export function ResumeParseCacheGrid() {
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
    }): Promise<ResumeParseCacheResult> =>
      rpcFetch<ResumeParseCacheResult>(
        rpc.api.platform["resume-parse-cache"].$get({
          query: {
            cacheType: params.filters.cacheType,
            page: String(params.page),
            pageSize: String(params.pageSize),
            parsedStatus: params.filters.parsedStatus,
            ...(params.search ? { search: params.search } : {}),
            sortBy:
              (params.sortBy as
                | "createdAt"
                | "filename"
                | "parsedAt"
                | "parsedStatus"
                | "size"
                | undefined) ?? "parsedAt",
            sortOrder: params.sortOrder ?? "desc",
            textSource: params.filters.textSource,
          },
        }),
        "加载解析缓存失败",
      ),
    [],
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
          toast.error(error instanceof Error ? error.message : "删除解析缓存失败"),
        operation: async () => {
          const response = await rpcFetch<{ clearedCount: number }>(
            rpc.api.platform["resume-parse-cache"][":hash"].$delete({
              param: { hash: record.contentHash },
            }),
            "删除解析缓存失败",
          );
          toast.success(`缓存已删除，${response.clearedCount} 条同 Hash 记录已失效`);
          grid.invalidate();
        },
      });
      return result.ok;
    },
    [grid],
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
              className="h-8 px-2.5 text-xs"
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
        title: () => <div className="text-right">操作</div>,
      }),
    ],
    [deleteCache, deletingId],
  );

  return (
    <>
      <DataGrid<ResumeParseCacheRecord>
        {...grid.bind}
        columnPinning={{ right: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconDatabase />
              </EmptyMedia>
              <EmptyTitle>没有解析缓存</EmptyTitle>
              <EmptyDescription>当前筛选条件下没有可复用的 OCR 或结构化解析结果。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={FILTERS}
        getRowId={(record) => record.id}
      />
      <CacheJsonDialog onOpenChange={(open) => !open && setViewTarget(null)} record={viewTarget} />
    </>
  );
}
