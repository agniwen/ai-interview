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

export interface ActionInline<TData> {
  icon: LucideIcon;
  /** 桌面态作为按钮文字 + 始终作为 aria-label；移动态隐藏文字时也提供 title 兜底。
   *  Used as the visible label on ≥sm and as aria-label / title fallback otherwise. */
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
  /** Header label; defaults to "操作" so all tables get a consistent column title. */
  title?: string;
  /** Override id (default 'actions') */
  id?: string;
  /** Override size; default = 36*inlineCount + 36 (menu) + padding */
  size?: number;
}

export function actionsColumn<TData>(opts: ActionsColumnOptions<TData>): ColumnDef<TData> {
  const inlineButtons = opts.inline ?? [];
  const menuItems = opts.menu ?? [];
  // 桌面态按钮带文字时占位更大（≈72px inline、≈64px 更多），列宽按桌面估算；
  // 移动态实际只用图标，留白即可。
  // Desktop carries text → ≈72px per inline + ≈64px for the "更多" trigger;
  // mobile is icon-only and uses the slack.
  const inferredSize = inlineButtons.length * 72 + (menuItems.length > 0 ? 64 : 0) + 32;

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
              // 移动态（<sm）：保持 size-8 方形仅图标，跟旧版一致；
              // 桌面态（≥sm）：自动宽度，图标 + 文字 (text-xs)，label 直接可见。
              // <sm: keep the legacy size-8 icon-only square button;
              // ≥sm: auto-width pill with icon + text-xs label.
              <Button
                aria-label={action.label}
                className="size-8 sm:h-8 sm:w-auto sm:px-2.5"
                disabled={disabled}
                key={action.label}
                onClick={() => void action.onClick(record)}
                size="icon"
                title={action.label}
                variant="ghost"
              >
                <Icon className="size-4 sm:size-3.5" />
                <span className="hidden text-xs sm:inline">{action.label}</span>
              </Button>
            );
          })}
          {visibleMenu.length > 0 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="更多操作"
                  className="size-8 sm:h-8 sm:w-auto sm:px-2.5"
                  size="icon"
                  title="更多操作"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="size-4 sm:size-3.5" />
                  <span className="hidden text-xs sm:inline">更多</span>
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
    header: () => <div className="text-right">{opts.title ?? "操作"}</div>,
    id: opts.id ?? "actions",
    size: opts.size ?? inferredSize,
  };
}
