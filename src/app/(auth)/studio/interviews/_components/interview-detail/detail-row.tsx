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
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
      <span className="pt-0.5 text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 break-words text-foreground leading-relaxed ${valueClassName ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}
