import type { ColumnDef } from "@tanstack/react-table";
import type { StudioInterviewListRecord } from "@/lib/studio-interviews";
import {
  ArrowUpDownIcon,
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { scheduleEntryStatusMeta } from "@/lib/studio-interviews";
import { InterviewStatusBadge } from "../interview-status-badge";

/**
 * 列定义需要的回调集合。
 * Callbacks the column definitions need to call.
 */
export interface InterviewListColumnHandlers {
  onViewDetail: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (record: StudioInterviewListRecord) => void;
  onPreviewResume: (record: StudioInterviewListRecord) => void;
  onViewJobDescription: (id: string) => void;
  onCopyLink: (record: StudioInterviewListRecord) => void | Promise<void>;
}

/**
 * 构建面试列表的列定义。把列定义提到外部文件后，列变更与页面状态变更可以独立 review。
 * Build the column definitions for the interview list. Lifting the columns out lets
 * column changes and page-state changes be reviewed independently.
 */
export function buildInterviewListColumns(
  handlers: InterviewListColumnHandlers,
): ColumnDef<StudioInterviewListRecord>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          aria-label="选择此行"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="全选当前页"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      id: "select",
      size: 36,
    },
    {
      accessorKey: "candidateName",
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{record.candidateName}</p>
            <p className="truncate text-muted-foreground text-xs">
              {record.candidateEmail || "未填写邮箱"}
            </p>
          </div>
        );
      },
      enableSorting: false,
      header: "候选人",
      size: 180,
    },
    {
      accessorKey: "targetRole",
      cell: ({ row }) => row.original.targetRole || "待识别岗位",
      header: "目标岗位",
    },
    {
      cell: ({ row }) => {
        const name = row.original.jobDescriptionName;
        if (!name) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <button
            className="cursor-pointer truncate text-left underline-offset-4 hover:underline"
            onClick={() => {
              if (row.original.jobDescriptionId) {
                handlers.onViewJobDescription(row.original.jobDescriptionId);
              }
            }}
            type="button"
          >
            {name}
          </button>
        );
      },
      header: "关联岗位",
      id: "jobDescriptionName",
    },
    {
      accessorKey: "resumeFileName",
      cell: ({ row }) => {
        const record = row.original;
        const label = record.resumeFileName || "手动创建";
        if (!record.hasResumeFile) {
          return (
            <div
              aria-disabled
              className="max-w-48 cursor-not-allowed truncate text-sm opacity-50"
              title="暂无简历 PDF"
            >
              {label}
            </div>
          );
        }
        return (
          <button
            className="block max-w-48 cursor-pointer truncate text-left text-sm underline-offset-4 hover:underline"
            onClick={() => handlers.onPreviewResume(record)}
            type="button"
          >
            {label}
          </button>
        );
      },
      header: "简历文件",
    },
    {
      accessorKey: "status",
      cell: ({ row }) => <InterviewStatusBadge status={row.original.status} />,
      header: "状态",
    },
    {
      cell: ({ row }) => {
        const [currentEntry] = row.original.scheduleEntries;
        if (!currentEntry) {
          return "未安排";
        }
        const statusKey = (currentEntry.status ??
          "pending") as keyof typeof scheduleEntryStatusMeta;
        const statusMeta = scheduleEntryStatusMeta[statusKey] ?? scheduleEntryStatusMeta.pending;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-medium text-sm">{currentEntry.roundLabel}</p>
              <Badge className="px-1.5 py-0 text-[10px]" variant={statusMeta.tone}>
                {statusMeta.label}
              </Badge>
            </div>
          </div>
        );
      },
      header: "当前轮次",
      id: "currentRound",
    },
    {
      cell: ({ row }) => `${row.original.questionCount} 题`,
      header: "题目数",
      id: "questionCount",
    },
    {
      cell: ({ row }) => row.original.creatorName ?? "—",
      header: "创建人",
      id: "creatorName",
    },
    {
      cell: ({ row }) => row.original.creatorOrganizationName ?? "—",
      header: "创建人组织",
      id: "creatorOrganizationName",
    },
    {
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={row.original.createdAt} />
      ),
      header: ({ column }) => (
        <Button
          className="px-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          创建时间
          <ArrowUpDownIcon className="size-4" />
        </Button>
      ),
    },
    {
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div className="flex items-center justify-end gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="查看详情"
                  className="size-8"
                  onClick={() => handlers.onViewDetail(record.id)}
                  size="icon"
                  variant="ghost"
                >
                  <EyeIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看详情</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="编辑记录"
                  className="size-8"
                  onClick={() => handlers.onEdit(record.id)}
                  size="icon"
                  variant="ghost"
                >
                  <PencilIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑记录</TooltipContent>
            </Tooltip>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button aria-label="更多操作" className="size-8" size="icon" variant="ghost">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>更多操作</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handlers.onCopyLink(record)}>
                  <CopyIcon className="size-4" />
                  复制面试链接
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handlers.onDelete(record)} variant="destructive">
                  <Trash2Icon className="size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableHiding: false,
      id: "actions",
      size: 140,
    },
  ];
}
