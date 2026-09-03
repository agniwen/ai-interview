import type { ReactNode } from "react";

/**
 * "标签 + 值"的两栏行布局：在面试详情概览中大量复用。
 * A two-column "label + value" row, used heavily across the interview detail dialog.
 */
export function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`mt-1 block min-w-0 wrap-break-word text-foreground text-sm leading-6 ${
          valueClassName ?? ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
