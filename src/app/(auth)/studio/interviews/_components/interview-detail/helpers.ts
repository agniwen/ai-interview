/**
 * 面试详情弹窗使用的纯函数工具集合。
 * Pure helper functions used by the interview detail dialog.
 *
 * 把这些抽到独立文件，是为了让主组件文件聚焦于 UI 结构与交互。
 * Extracted into their own file so the main component can focus on UI / interaction.
 */

/**
 * 把展示值规范化为字符串：null / undefined / "" 一律显示"未填写"。
 * Normalize a displayed value; null / undefined / "" all become "未填写".
 */
export function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "未填写";
  }
  return String(value);
}

/**
 * 把 unknown 安全转换为非空字符串数组。
 * Safely coerce unknown to a non-empty string array.
 */
export function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}

/**
 * 把 unknown 当作 T[] 返回；非数组则返回空数组。
 * Cast unknown to T[]; non-arrays become empty array.
 */
export function ensureArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * 简历项目经历的字段在数据源中可能缺失，这里做容错与字段补齐。
 * Resume project experience fields may be missing in the data source — this normalises them.
 */
export function ensureProjectExperiences(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as {
      name?: string | null;
      role?: string | null;
      period?: string | null;
      summary?: string | null;
      techStack: string[];
    }[];
  }

  return value
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => {
      const project = item as Record<string, unknown>;
      return {
        name: typeof project.name === "string" ? project.name : null,
        period: typeof project.period === "string" ? project.period : null,
        role: typeof project.role === "string" ? project.role : null,
        summary: typeof project.summary === "string" ? project.summary : null,
        techStack: ensureStringArray(project.techStack),
      };
    });
}

/**
 * 截断文本：超过 maxLength 则添加省略号；空值返回 formatValue 的占位符。
 * Truncate text; values longer than maxLength get an ellipsis. Empty falls back to "未填写".
 */
export function truncateText(value: string | number | null | undefined, maxLength = 320) {
  const text = formatValue(value);
  if (text === "未填写" || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
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
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
    case "done": {
      return "default";
    }
    case "failed": {
      return "destructive";
    }
    case "connected": {
      return "secondary";
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
): "default" | "secondary" | "destructive" {
  if (recommendation.includes("不建议")) {
    return "destructive";
  }
  if (recommendation.includes("待定")) {
    return "secondary";
  }
  return "default";
}
