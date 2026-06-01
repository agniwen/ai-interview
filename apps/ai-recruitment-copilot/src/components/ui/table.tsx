"use client";

import * as React from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { cn } from "@/lib/shared/utils";

function Table({
  className,
  containerClassName,
  containerStyle,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
}) {
  return (
    <OverlayScrollbarsComponent
      data-slot="table-container"
      defer
      element="div"
      className={cn("w-full overflow-x-auto", containerClassName)}
      options={{
        scrollbars: {
          autoHide: "leave",
          autoHideDelay: 600,
          theme: "os-theme-app",
        },
      }}
      style={containerStyle}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </OverlayScrollbarsComponent>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({
  className,
  spacing = 8,
  ...props
}: React.ComponentProps<"tbody"> & {
  spacing?: number;
}) {
  return (
    <>
      <tbody
        aria-hidden="true"
        className="table-row"
        data-slot="table-body-spacer"
        style={{ height: spacing }}
      />
      <tbody data-slot="table-body" className={className} {...props} />
    </>
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("group/row", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "bg-muted px-3 py-2 text-left align-middle font-medium text-muted-foreground text-sm whitespace-nowrap first:rounded-l-lg last:rounded-r-lg [&:has([role=checkbox])]:pr-3 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-16 px-3 align-middle whitespace-nowrap transition duration-200 ease-out first:rounded-l-xl last:rounded-r-xl group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted [&:has([role=checkbox])]:pr-3 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function TableRowDivider({
  className,
  dividerClassName,
  ...props
}: React.ComponentProps<"tr"> & {
  dividerClassName?: string;
}) {
  return (
    <tr aria-hidden="true" className={className} data-slot="table-row-divider" {...props}>
      <td className="py-1" colSpan={999}>
        <div
          className={cn(
            "relative h-1 w-full before:absolute before:top-1/2 before:left-0 before:h-px before:w-full before:-translate-y-1/2 before:bg-border",
            dividerClassName,
          )}
        />
      </td>
    </tr>
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowDivider,
};
