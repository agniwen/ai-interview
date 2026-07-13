import type { ReactNode } from "react";

import { TimeDisplay } from "@/components/features/display/time-display";
import { EmptyValue } from "@/components/features/display/empty-value";
import { cn } from "@arc/shared/utils";

export type DataFieldKind = "boolean" | "date" | "datetime" | "email" | "number" | "phone" | "text";

export type DataFieldSpan = 1 | 2 | 3 | 4 | "full";

const SPAN_CLASS: Record<DataFieldSpan, string> = {
  1: "col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-3 2xl:col-span-4",
  full: "col-span-full",
};

function isEmptyValue(value: ReactNode) {
  return value === null || value === undefined || value === "";
}

function renderValue({
  emptyValue,
  kind,
  numberFormat,
  value,
}: {
  emptyValue: ReactNode;
  kind: DataFieldKind;
  numberFormat?: Intl.NumberFormatOptions;
  value: ReactNode;
}) {
  if (isEmptyValue(value)) {
    return <EmptyValue>{emptyValue}</EmptyValue>;
  }

  if (kind === "email" && typeof value === "string") {
    return (
      <a
        className="break-all underline-offset-4 hover:underline focus-visible:underline"
        href={`mailto:${value}`}
      >
        {value}
      </a>
    );
  }

  if (kind === "phone" && typeof value === "string") {
    return (
      <a
        className="underline-offset-4 hover:underline focus-visible:underline"
        href={`tel:${value}`}
      >
        {value}
      </a>
    );
  }

  if (kind === "number" && typeof value === "number") {
    return new Intl.NumberFormat("zh-CN", numberFormat).format(value);
  }

  if (kind === "boolean" && typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (
    (kind === "date" || kind === "datetime") &&
    (typeof value === "string" || typeof value === "number" || value instanceof Date)
  ) {
    return (
      <TimeDisplay
        as="span"
        emptyText={String(emptyValue)}
        options={kind === "date" ? "YY/MM/DD" : undefined}
        value={value}
      />
    );
  }

  return value;
}

export interface DataFieldProps {
  label: ReactNode;
  value: ReactNode;
  kind?: DataFieldKind;
  span?: DataFieldSpan;
  emptyValue?: ReactNode;
  numberFormat?: Intl.NumberFormatOptions;
  className?: string;
  valueClassName?: string;
}

export function DataField({
  label,
  value,
  kind = "text",
  span = 1,
  emptyValue = "—",
  numberFormat,
  className,
  valueClassName,
}: DataFieldProps) {
  return (
    <div className={cn("min-w-0", SPAN_CLASS[span], className)} data-slot="data-field">
      <dt className="text-muted-foreground text-xs leading-5">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 min-w-0 wrap-break-word text-sm leading-6",
          kind === "number" && "font-medium tabular-nums",
          valueClassName,
        )}
      >
        {renderValue({ emptyValue, kind, numberFormat, value })}
      </dd>
    </div>
  );
}
