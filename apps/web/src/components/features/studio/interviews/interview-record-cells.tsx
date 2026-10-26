import {
  humanInterviewFormatMeta,
  scheduleEntryStatusMeta,
} from "@app/db-schema/studio-interviews";
import type {
  StudioInterviewRecordKind,
  StudioInterviewRecordListRecord,
  StudioInterviewRecordStatus,
} from "@app/shared/studio-interview-rounds";
import { Blobatar } from "@blobatar/react";
import { IconSparkles, IconUser } from "@tabler/icons-react";
import {
  EvaluationConclusionBadge,
  PersonAvatar,
} from "@/components/features/studio/calendar/interview-evaluation-hover-card";
import { uniqueText } from "@/components/features/studio/calendar/studio-calendar-people";
import { Badge } from "@/components/ui/badge";
import { cn } from "@app/shared/utils";

// 面试记录表里 AI / 真人面试共用列的单元格。/ Cells shared by AI and human rows in the interview records table.

// 与 PersonAvatar（size-4.5）同尺寸，面试官列里的头像对齐。/ Matches PersonAvatar's 18px size.
const AGENT_AVATAR_SIZE = 18;

type BadgeTone = "success" | "warning" | "info" | "outline";

const recordStatusMeta = {
  ...scheduleEntryStatusMeta,
  cancelled: { label: "已取消", tone: "outline" },
} as const satisfies Record<StudioInterviewRecordStatus, { label: string; tone: BadgeTone }>;

export const interviewRecordStatusFilterOptions = [
  { label: "待开始", value: "pending" },
  { label: "进行中", value: "in_progress" },
  { label: "已完成", value: "completed" },
  { label: "已中断", value: "interrupted" },
  { label: "已取消", value: "cancelled" },
] as const satisfies readonly { label: string; value: StudioInterviewRecordStatus }[];

// 色调与面试管理、招聘台阶段徽标一致：AI 面试用紫色，真人面试用天蓝。
// Same tones as interview management and recruiting stage badges.
const KIND_META = {
  ai: { className: "bg-purple-tint text-purple-ink", icon: IconSparkles, label: "AI 面试" },
  human: { className: "bg-sky-tint text-sky-ink", icon: IconUser, label: "真人面试" },
} as const satisfies Record<
  StudioInterviewRecordKind,
  { className: string; icon: typeof IconUser; label: string }
>;

export function InterviewRecordKindCell({ record }: { record: StudioInterviewRecordListRecord }) {
  const { className, icon: Icon, label } = KIND_META[record.kind];
  return (
    // 两类徽标等宽居中，列里上下对齐。Equal-width badges so both kinds line up in the column.
    <Badge className={cn("w-22 justify-center", className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function InterviewRecordRoundCell({ record }: { record: StudioInterviewRecordListRecord }) {
  if (record.kind === "ai") {
    return <span className="truncate">{record.roundLabel}</span>;
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="truncate">{record.roundLabel}</span>
      <span className="shrink-0 text-muted-foreground text-xs">
        {humanInterviewFormatMeta[record.format].label}
      </span>
    </span>
  );
}

export function InterviewRecordStatusCell({ record }: { record: StudioInterviewRecordListRecord }) {
  const meta = recordStatusMeta[record.status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function InterviewRecordInterviewersCell({
  record,
}: {
  record: StudioInterviewRecordListRecord;
}) {
  if (record.kind === "ai") {
    if (!record.interviewerAgentName) {
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <PersonAvatar avatarUrl={null} kind="ai" seed="ai" />
          <span className="truncate">AI 面试官</span>
        </span>
      );
    }
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        {/* 与面试官 Agent 管理一致，头像由 Agent 名称确定性生成。Same name-seeded avatar as agent management. */}
        <Blobatar
          alt=""
          className="shrink-0 rounded-full"
          name={record.interviewerAgentName}
          size={AGENT_AVATAR_SIZE}
        />
        <span className="truncate">{`${record.interviewerAgentName} (Agent)`}</span>
      </span>
    );
  }
  if (record.interviewers.length === 0) {
    return <span className="text-muted-foreground">面试官待确认</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1">
        {record.interviewers.slice(0, 3).map((interviewer) => (
          <span className="rounded-full ring-2 ring-background" key={interviewer.id}>
            <PersonAvatar avatarUrl={interviewer.image} seed={interviewer.id} />
          </span>
        ))}
      </span>
      <span className="truncate">
        {uniqueText(record.interviewers.map((interviewer) => interviewer.name))}
      </span>
    </span>
  );
}

/** 两类面试均展示本轮评价结论。 */
export function InterviewRecordResultCell({ record }: { record: StudioInterviewRecordListRecord }) {
  const conclusion = record.kind === "ai" ? (record.reviewOutcome ?? "none") : record.conclusion;
  if (conclusion === "none") {
    return (
      <Badge className="w-16 justify-center" variant="outline">
        未评价
      </Badge>
    );
  }
  return <EvaluationConclusionBadge className="w-16 justify-center" conclusion={conclusion} />;
}

/** 招聘记录上的候选人评价表链接；尚未生成时显示占位。/ Record-level evaluation document link. */
export function InterviewRecordDocumentLink({ url }: { url: string | null }) {
  if (!url) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <a
      className="text-primary-link underline underline-offset-4 hover:text-primary-link/80"
      href={url}
      onClick={(event) => event.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
    >
      查看评价表
    </a>
  );
}
