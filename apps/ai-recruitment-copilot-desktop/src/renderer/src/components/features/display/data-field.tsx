import type { ReactNode } from "react";
import { EmptyValue } from "@/components/features/display/empty-value";
import { formatLocalDateTime } from "@/components/features/studio/resumes/resume-display";
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

const numberFormatters = new Map<string, Intl.NumberFormat>();

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options ?? {});
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("zh-CN", options);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

function isEmptyValue(value: ReactNode) {
  return value === null || value === undefined || value === "";
}

function renderContactLink(kind: "email" | "phone", value: string) {
  const href = kind === "email" ? `mailto:${value}` : `tel:${value}`;
  return (
    <a
      className={cn(
        "underline-offset-4 hover:underline focus-visible:underline",
        kind === "email" && "break-all",
      )}
      href={href}
    >
      {value}
    </a>
  );
}

function renderDateOrDateTime(kind: "date" | "datetime", value: string | number | Date) {
  if (kind === "date" && (typeof value === "string" || typeof value === "number")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("zh-CN");
    }
  }
  return formatLocalDateTime(value instanceof Date ? value.toISOString() : String(value));
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
    return renderContactLink("email", value);
  }

  if (kind === "phone" && typeof value === "string") {
    return renderContactLink("phone", value);
  }

  if (kind === "number" && typeof value === "number") {
    return formatNumber(value, numberFormat);
  }

  if (kind === "boolean" && typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (
    (kind === "date" || kind === "datetime") &&
    (typeof value === "string" || typeof value === "number" || value instanceof Date)
  ) {
    return renderDateOrDateTime(kind, value);
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
