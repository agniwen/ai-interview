import { humanInterviewRoundOutcomeMeta } from "@arc/db-schema/studio-interviews";
/* oxlint-disable no-use-before-define -- status helpers compose one another */
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@arc/shared/studio-pipeline-stages";

export function describeRoundSummaryStatus(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
): {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
} {
  if (round.status === "cancelled") {
    return { label: "已取消", tone: "outline" };
  }
  if (round.status === "completed") {
    if (round.outcome) {
      return {
        label: `已完成 · ${humanInterviewRoundOutcomeMeta[round.outcome].label}`,
        tone: humanInterviewRoundOutcomeMeta[round.outcome].tone,
      };
    }
    return { label: "已完成", tone: "success" };
  }
  if (meeting) {
    return describeMeetingStatus(meeting);
  }
  return { label: "待安排", tone: "info" };
}

export function describeMeetingStatus(meeting: HumanInterviewMeetingRecord): {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
} {
  if (meeting.status === "cancelled") {
    return { label: "已取消", tone: "outline" };
  }
  if (meeting.status === "ended") {
    return { label: "已结束", tone: "outline" };
  }
  if (meeting.status === "in_progress") {
    return {
      label: "视频会议进行中",
      tone: "success",
    };
  }
  return {
    label: "待开始（视频）",
    tone: "info",
  };
}

export function canOpenMeetingLinks(meeting: HumanInterviewMeetingRecord | null): boolean {
  return meeting?.status === "scheduled" || meeting?.status === "in_progress";
}

export function canEndHumanInterviewMeeting(
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || !meeting) {
    return false;
  }
  return meeting.status === "in_progress";
}

export function canCancelHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || round.status !== "pending") {
    return false;
  }
  return meeting === null || meeting.status === "scheduled";
}

export function canCompleteHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  return disabled !== true && round.status === "pending" && meeting?.status === "ended";
}

export function canRescheduleHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || round.status !== "pending") {
    return false;
  }
  return meeting === null || meeting.status === "scheduled";
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 卡片底部「评分 / 反馈 / 取消原因」区块是否需要渲染。
// 抽成 helper 避免在 JSX 里堆负条件被 no-negated-condition 标记。
// Helper for the "extra details" footer visibility; keeps JSX free of negated
// equality checks.
export function hasRoundDetails(round: HumanInterviewRoundRecord): boolean {
  return Boolean(round.feedback) || round.score !== null || Boolean(round.cancelReason);
}

export function formatDateTime(iso: string): string {
  // 用本地时区按 YYYY-MM-DD HH:mm 展示，避免国际化包负担。
  // Local time-zone, no i18n lib.
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function toDateTimeLocalInputValue(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function addOneHourToIsoString(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString();
}

export function addOneHourToDateTimeLocalInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return toDateTimeLocalInputValue(new Date(date.getTime() + 60 * 60 * 1000).toISOString());
}

export function buildHumanInterviewMeetingTitle(candidateName: string, roundLabel: string): string {
  return `${candidateName} - ${roundLabel}`.slice(0, 100);
}

// ── 新建轮次 dialog ──
// Schedule (create) dialog.
