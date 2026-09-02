import type { ComponentProps, ReactNode } from "react";

import { cn } from "@app/shared/utils";

export type DataFieldsColumns = 1 | 2 | 3 | 4;
export type DataFieldsDensity = "compact" | "default" | "relaxed";

const COLUMNS_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
} satisfies Record<DataFieldsColumns, string>;

const DENSITY_CLASS = {
  compact: "gap-x-8 gap-y-3",
  default: "gap-x-8 gap-y-4",
  relaxed: "gap-x-8 gap-y-6",
} satisfies Record<DataFieldsDensity, string>;

export interface DataFieldsProps extends ComponentProps<"dl"> {
  columns?: DataFieldsColumns;
  density?: DataFieldsDensity;
  label?: ReactNode;
  labelClassName?: string;
}

export function DataFields({
  columns = 2,
  density = "default",
  label,
  labelClassName,
  className,
  ...props
}: DataFieldsProps) {
  const fields = (
    <dl
      className={cn("grid", COLUMNS_CLASS[columns], DENSITY_CLASS[density], className)}
      data-slot="data-fields"
      {...props}
    />
  );

  if (!label) {
    return fields;
  }

  return (
    <div className="flex flex-col gap-3" data-slot="data-fields-group">
      <h3 className={cn("font-medium text-sm", labelClassName)}>{label}</h3>
      {fields}
    </div>
  );
}
