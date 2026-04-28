// src/components/data-grid/columns/actions-column.tsx
import type { ColumnDef } from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ActionInline<TData> {
  icon: LucideIcon;
  // tooltip + aria-label
  label: string;
  onClick: (row: TData) => void | Promise<void>;
  disabled?: (row: TData) => boolean;
  show?: (row: TData) => boolean;
}

export interface ActionMenuItem<TData> {
  icon?: LucideIcon;
  label: string;
  onClick: (row: TData) => void | Promise<void>;
  variant?: "default" | "destructive";
  separator?: "before";
  show?: (row: TData) => boolean;
}

export interface ActionsColumnOptions<TData> {
  inline?: ActionInline<TData>[];
  menu?: ActionMenuItem<TData>[];
  menuLabel?: string;
  /** Override id (default 'actions') */
  id?: string;
  /** Override size; default = 36*inlineCount + 36 (menu) + padding */
  size?: number;
}

export function actionsColumn<TData>(opts: ActionsColumnOptions<TData>): ColumnDef<TData> {
  const inlineButtons = opts.inline ?? [];
  const menuItems = opts.menu ?? [];
  const inferredSize = inlineButtons.length * 36 + (menuItems.length > 0 ? 36 : 0) + 32;

  return {
    cell: ({ row }) => {
      const record = row.original;
      const visibleInline = inlineButtons.filter((a) => a.show?.(record) ?? true);
      const visibleMenu = menuItems.filter((a) => a.show?.(record) ?? true);

      return (
        <div className="flex items-center justify-end gap-0.5">
          {visibleInline.map((action) => {
            const Icon = action.icon;
            const disabled = action.disabled?.(record) ?? false;
            return (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={action.label}
                    className="size-8"
                    disabled={disabled}
                    onClick={() => void action.onClick(record)}
                    size="icon"
                    variant="ghost"
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.label}</TooltipContent>
              </Tooltip>
            );
          })}
          {visibleMenu.length > 0 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button aria-label="更多操作" className="size-8" size="icon" variant="ghost">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{opts.menuLabel ?? "更多操作"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {visibleMenu.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label}>
                      {item.separator === "before" && index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        onSelect={() => void item.onClick(record)}
                        variant={item.variant}
                      >
                        {Icon ? <Icon className="size-4" /> : null}
                        {item.label}
                      </DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      );
    },
    enableHiding: false,
    enableSorting: false,
    id: opts.id ?? "actions",
    size: opts.size ?? inferredSize,
  };
}
