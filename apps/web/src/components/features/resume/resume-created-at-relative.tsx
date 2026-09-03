"use client";

import { cn } from "@app/shared/utils";

/**
 * 判断记录创建时间相对当前简历（reference）的先后关系。
 * Whether a record was created earlier than the current resume.
 */
export function getCreatedAtRelation(
  createdAt: string,
  referenceCreatedAt: string,
): "earlier" | "later" | null {
  if (!createdAt || !referenceCreatedAt || createdAt === referenceCreatedAt) {
    return null;
  }
  return new Date(createdAt).getTime() < new Date(referenceCreatedAt).getTime()
    ? "earlier"
    : "later";
}

/**
 * 创建时间相对当前简历的早/晚标注：比当前早用红色，比当前晚用绿色。
 * 字号不单独指定，继承所在文本行（text-xs），保证与创建时间协调。
 */
export function CreatedAtRelativeLabel({
  createdAt,
  referenceCreatedAt,
  className,
}: {
  createdAt: string;
  referenceCreatedAt: string;
  className?: string;
}) {
  const relation = getCreatedAtRelation(createdAt, referenceCreatedAt);
  if (!relation) {
    return null;
  }
  return (
    <span
      className={cn(
        "ml-1.5 whitespace-nowrap",
        className,
        relation === "earlier"
          ? "text-red-600 dark:text-red-400"
          : "text-green-600 dark:text-green-400",
      )}
    >
      比当前简历加入{relation === "earlier" ? "早" : "晚"}
    </span>
  );
}
