"use client";

import * as React from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { cn } from "@arc/shared/utils";

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
    <div className="rounded-2xl border bg-muted p-1 " data-slot="table-frame">
      <OverlayScrollbarsComponent
        className={cn("w-full overflow-x-auto rounded-xl", containerClassName)}
        data-slot="table-container"
        defer
        element="div"
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
          className={cn(
            "w-full border-separate border-spacing-0 caption-bottom text-sm",
            className,
          )}
          {...props}
        />
      </OverlayScrollbarsComponent>
    </div>
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
      <tbody
        data-slot="table-body"
        className={cn(
          "[&>tr:first-child>td:first-child]:rounded-tl-xl [&>tr:first-child>td:last-child]:rounded-tr-xl [&>tr:last-child>td:first-child]:rounded-bl-xl [&>tr:last-child>td:last-child]:rounded-br-xl",
          className,
        )}
        {...props}
      />
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
        "bg-muted px-4 py-1.5 text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap first:rounded-l-xl last:rounded-r-xl [&:has([role=checkbox])]:px-3 [&>[role=checkbox]]:translate-y-[2px]",
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
        "h-14 bg-background px-4 align-middle whitespace-nowrap transition duration-200 ease-out group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted [&:has([role=checkbox])]:px-3 [&>[role=checkbox]]:translate-y-[2px]",
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
      <td className="p-0" colSpan={999}>
        <div className={cn("mx-4 h-px bg-border/70", dividerClassName)} />
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
