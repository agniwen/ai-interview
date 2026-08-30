import type { ReactNode } from "react";
import { EmptyValue } from "@/components/features/display/empty-value";
import { formatAppDate, formatAppDateTime } from "@/lib/client/datetime";
import { cn } from "@arc/shared/utils";

export type DataFieldKind = "boolean" | "date" | "datetime" | "email" | "number" | "phone" | "text";

export type DataFieldSpan = 1 | 2 | 3 | 4 | "full";

const SPAN_CLASS = {
  1: "col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-3 2xl:col-span-4",
  full: "col-span-full",
} satisfies Record<DataFieldSpan, string>;

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

type EmptyDataFieldValue = "" | null | undefined;

type DataFieldValue =
  | { kind?: "text"; value: ReactNode }
  | { kind: "boolean"; value: boolean | EmptyDataFieldValue }
  | { kind: "date" | "datetime"; value: string | number | Date | EmptyDataFieldValue }
  | { kind: "email" | "phone"; value: string | EmptyDataFieldValue }
  | { kind: "number"; value: number | EmptyDataFieldValue };

function isEmptyValue(value: DataFieldValue["value"]): value is EmptyDataFieldValue {
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
  if (kind === "date") {
    return formatAppDate(value);
  }
  return formatAppDateTime(value);
}

function renderValue({
  emptyValue,
  numberFormat,
  ...field
}: DataFieldValue & {
  emptyValue: ReactNode;
  numberFormat?: Intl.NumberFormatOptions;
}) {
  if (isEmptyValue(field.value)) {
    return <EmptyValue>{emptyValue}</EmptyValue>;
  }

  if (field.kind === "email") {
    return renderContactLink("email", field.value);
  }

  if (field.kind === "phone") {
    return renderContactLink("phone", field.value);
  }

  if (field.kind === "number") {
    return formatNumber(field.value, numberFormat);
  }

  if (field.kind === "boolean") {
    return field.value ? "是" : "否";
  }

  if (field.kind === "date" || field.kind === "datetime") {
    return renderDateOrDateTime(field.kind, field.value);
  }

  if (field.kind === "text" || field.kind === undefined) {
    return field.value;
  }

  return null;
}

interface DataFieldSharedProps {
  label: ReactNode;
  span?: DataFieldSpan;
  emptyValue?: ReactNode;
  numberFormat?: Intl.NumberFormatOptions;
  className?: string;
  valueClassName?: string;
}

export type DataFieldProps = DataFieldSharedProps & DataFieldValue;

export function DataField(props: DataFieldProps) {
  const { className, emptyValue = "—", label, numberFormat, span = 1, valueClassName } = props;
  return (
    <div className={cn("min-w-0", SPAN_CLASS[span], className)} data-slot="data-field">
      <dt className="text-muted-foreground text-xs leading-5">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 min-w-0 wrap-break-word text-sm leading-6",
          props.kind === "number" && "font-medium tabular-nums",
          valueClassName,
        )}
      >
        {renderValue({ ...props, emptyValue, numberFormat })}
      </dd>
    </div>
  );
}
