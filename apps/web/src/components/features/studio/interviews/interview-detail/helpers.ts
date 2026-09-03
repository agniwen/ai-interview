/**
 * 面试详情弹窗使用的纯函数工具集合。
 * Pure helper functions used by the interview detail dialog.
 *
 * 把这些抽到独立文件，是为了让主组件文件聚焦于 UI 结构与交互。
 * Extracted into their own file so the main component can focus on UI / interaction.
 */

import type { JsonObject } from "@app/db-schema/json";
import { readInterviewEndReason } from "@app/shared/interview/end-reason";

export function formatInterviewEndReason(metadata: JsonObject): string {
  switch (readInterviewEndReason(metadata)) {
    case "candidate_clicked_end": {
      return "候选人点击结束";
    }
    case "candidate_ended_round": {
      return "候选人要求结束";
    }
    case "task_completed": {
      return "系统自然结束";
    }
    case "time_limit": {
      return "达到时间上限";
    }
    case "reconnect_grace_expired":
    case "participant_disconnected": {
      return "连接中断结束";
    }
    case "system_shutdown":
    case "error": {
      return "系统错误结束";
    }
    case null: {
      return "未记录";
    }
    default: {
      return "其他原因";
    }
  }
}

/**
 * 把面试报告状态枚举翻译为中文标签。
 * Translate a report status enum value to a Chinese label.
 */
export function formatReportStatus(status: string) {
  switch (status) {
    case "completed":
    case "done": {
      return "已完成";
    }
    case "initiated": {
      return "已发起";
    }
    case "failed": {
      return "失败";
    }
    case "connected": {
      return "进行中";
    }
    case "disconnected": {
      return "已断开";
    }
    case "connecting": {
      return "连接中";
    }
    default: {
      return status || "未知";
    }
  }
}

/**
 * 报告状态对应的 Badge variant；视觉语义来自 shadcn/ui Badge。
 * Badge variant for a given report status. Variant semantics follow shadcn/ui.
 */
export function getReportBadgeVariant(
  status: string,
): "success" | "warning" | "danger" | "outline" {
  switch (status) {
    case "completed":
    case "done": {
      return "success";
    }
    case "failed": {
      return "danger";
    }
    case "connected": {
      return "warning";
    }
    default: {
      return "outline";
    }
  }
}

/**
 * 把"录用建议"文案映射到 Badge variant。
 * Map a recommendation phrase to a Badge variant.
 */
export function resolveRecommendationVariant(
  recommendation: string,
): "success" | "warning" | "danger" {
  if (recommendation.includes("不建议")) {
    return "danger";
  }
  if (recommendation.includes("待定")) {
    return "warning";
  }
  return "success";
}
