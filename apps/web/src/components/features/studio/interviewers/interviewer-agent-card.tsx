import { Blobatar } from "@blobatar/react";
import { getMinimaxVoiceMeta } from "@app/db-schema/minimax-voices";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import { IconMicrophone, IconTrash } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@app/shared/utils";

const AVATAR_SIZE = 40;

interface InterviewerAgentCardProps {
  record: InterviewerListRecord;
  onEdit?: (record: InterviewerListRecord) => void;
  onDelete?: (record: InterviewerListRecord) => void;
  /** 有引用且可查看岗位时传入，点击打开引用岗位弹窗。Opens the referenced JD modal. */
  onOpenJobDescriptions?: (record: InterviewerListRecord) => void;
}

function DeleteButton({
  blockedReason,
  name,
  onDelete,
}: {
  blockedReason: string | null;
  name: string;
  onDelete: () => void;
}) {
  const button = (
    <Button
      aria-label={`删除 ${name}`}
      className="relative z-10 -me-1 shrink-0 text-muted-foreground hover:text-destructive"
      disabled={blockedReason !== null}
      onClick={onDelete}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconTrash />
    </Button>
  );

  if (!blockedReason) {
    return button;
  }

  // 禁用按钮不接收指针/焦点事件，由外层可聚焦 span 承载 tooltip。
  // Disabled buttons get no pointer or focus events, so a focusable wrapper carries the tooltip.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={`无法删除 ${name}：${blockedReason}`}
            className="relative z-10 shrink-0"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Exposes the reason for the disabled control to keyboard users.
            tabIndex={0}
          >
            {button}
          </span>
        }
      />
      <TooltipContent className="max-w-60">{blockedReason}</TooltipContent>
    </Tooltip>
  );
}

export function InterviewerAgentCard({
  onDelete,
  onEdit,
  onOpenJobDescriptions,
  record,
}: InterviewerAgentCardProps) {
  const voiceMeta = getMinimaxVoiceMeta(record.voice);
  const jobCountLabel = `${record.jobDescriptionCount} 个岗位`;
  // 与服务端删除校验一致：仍被在招岗位引用时不能删除。Mirrors the server-side delete guard.
  const deleteBlockedReason =
    record.jobDescriptionCount > 0
      ? `已被 ${record.jobDescriptionCount} 个在招岗位引用，请先在岗位中移除后再删除`
      : null;

  return (
    <Card
      className={cn(
        "h-full gap-3 p-3 transition-colors",
        onEdit &&
          "hover:bg-accent/40 has-[[data-card-edit]:focus-visible]:border-ring has-[[data-card-edit]:focus-visible]:ring-[3px] has-[[data-card-edit]:focus-visible]:ring-ring/50",
      )}
    >
      <div className="flex items-center gap-3">
        {/* 头像由名称确定性生成，旁边已有名称，因此作为装饰图。Seeded by name; decorative next to the visible name. */}
        <Blobatar alt="" className="shrink-0 rounded-lg" name={record.name} size={AVATAR_SIZE} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground text-sm" title={record.name}>
            {onEdit ? (
              // 名称按钮的伪元素铺满整张卡片，实现整卡点击编辑；其余按钮用 z-10 浮在其上。
              // The name button's overlay makes the whole card open the editor; other controls sit above it.
              <button
                aria-label={`编辑 ${record.name}`}
                className="cursor-pointer text-start outline-none after:absolute after:inset-0 after:rounded-2xl"
                data-card-edit=""
                onClick={() => onEdit(record)}
                type="button"
              >
                {record.name}
              </button>
            ) : (
              record.name
            )}
          </h3>
          {record.departmentName ? (
            <p className="truncate text-muted-foreground text-xs">{record.departmentName}</p>
          ) : (
            <Badge variant="outline">未知部门</Badge>
          )}
        </div>
        {onDelete ? (
          <DeleteButton
            blockedReason={deleteBlockedReason}
            name={record.name}
            onDelete={() => onDelete(record)}
          />
        ) : null}
      </div>

      <p className="truncate text-muted-foreground text-xs" title={record.description || undefined}>
        {record.description || "暂无描述"}
      </p>

      <div className="mt-auto flex items-center gap-3 border-t pt-2.5 text-muted-foreground text-xs">
        <span
          className="inline-flex min-w-0 flex-1 items-center gap-1"
          title={voiceMeta?.description ?? undefined}
        >
          <IconMicrophone aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{voiceMeta?.label ?? record.voice}</span>
        </span>
        {onOpenJobDescriptions && record.jobDescriptionCount > 0 ? (
          <Button
            className="relative z-10 h-auto shrink-0 p-0 font-medium text-xs"
            onClick={() => onOpenJobDescriptions(record)}
            type="button"
            variant="link"
          >
            {jobCountLabel}
          </Button>
        ) : (
          <span className="shrink-0">{jobCountLabel}</span>
        )}
      </div>
    </Card>
  );
}

export function InterviewerAgentCardSkeleton() {
  return (
    <Card className="h-full gap-3 p-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-full" />
      <div className="flex items-center gap-3 border-t pt-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="ms-auto h-3 w-12" />
      </div>
    </Card>
  );
}
