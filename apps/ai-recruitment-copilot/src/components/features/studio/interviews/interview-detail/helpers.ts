/**
 * 面试详情弹窗使用的纯函数工具集合。
 * Pure helper functions used by the interview detail dialog.
 *
 * 把这些抽到独立文件，是为了让主组件文件聚焦于 UI 结构与交互。
 * Extracted into their own file so the main component can focus on UI / interaction.
 */

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
