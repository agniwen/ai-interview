// src/components/data-grid/columns/actions-column.tsx
import type { ColumnDef } from "@tanstack/react-table";
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
  /** Visible button text and aria-label/title fallback. */
  label: string;
  onClick: (row: TData) => void | Promise<void>;
  disabled?: (row: TData) => boolean;
  /** 禁用时显示在 title 里的解释文字。/ Reason shown in title when disabled. */
  disabledReason?: (row: TData) => string | null;
  show?: (row: TData) => boolean;
}

export interface ActionMenuItem<TData> {
  label: string;
  onClick: (row: TData) => void | Promise<void>;
  variant?: "default" | "destructive";
  separator?: "before";
  show?: (row: TData) => boolean;
  disabled?: (row: TData) => boolean;
  /** 禁用时显示在 title 里的解释文字。/ Reason shown in title when disabled. */
  disabledReason?: (row: TData) => string | null;
}

export interface ActionsColumnOptions<TData> {
  inline?: ActionInline<TData>[];
  menu?: ActionMenuItem<TData>[];
  menuLabel?: string;
  /** Header label; defaults to "操作" so all tables get a consistent column title. */
  title?: string;
  /** Override id (default 'actions') */
  id?: string;
  /** Override size; default estimates text-only inline actions + menu trigger. */
  size?: number;
}

const ACTION_CELL_HORIZONTAL_PADDING = 24;
const ACTION_BUTTON_HORIZONTAL_PADDING = 20;
const ACTION_MENU_TRIGGER_HORIZONTAL_PADDING = 10;
const ACTION_BUTTON_GAP = 2;
const MIN_ACTION_COLUMN_SIZE = 72;

function estimateActionLabelWidth(label: string) {
  let width = 0;
  for (const char of label) {
    if (char === " ") {
      width += 4;
      continue;
    }
    width += (char.codePointAt(0) ?? 0) <= 127 ? 7 : 13;
  }
  return width;
}

export function actionsColumn<TData>(opts: ActionsColumnOptions<TData>): ColumnDef<TData> {
  const inlineButtons = opts.inline ?? [];
  const menuItems = opts.menu ?? [];
  // Action buttons are text-only in tables; estimate enough width for labels.
  // 表格 action 按钮统一纯文字展示，列宽按 label 文本估算。
  const actionCount = inlineButtons.length + (menuItems.length > 0 ? 1 : 0);
  let inlineWidth = 0;
  for (const action of inlineButtons) {
    inlineWidth += estimateActionLabelWidth(action.label) + ACTION_BUTTON_HORIZONTAL_PADDING;
  }
  const menuWidth =
    menuItems.length > 0
      ? estimateActionLabelWidth("更多") + ACTION_MENU_TRIGGER_HORIZONTAL_PADDING
      : 0;
  const gapWidth = Math.max(actionCount - 1, 0) * ACTION_BUTTON_GAP;
  const inferredSize = Math.max(
    MIN_ACTION_COLUMN_SIZE,
    Math.ceil(inlineWidth + menuWidth + gapWidth + ACTION_CELL_HORIZONTAL_PADDING),
  );

  return {
    cell: ({ row }) => {
      const record = row.original;
      const visibleInline = inlineButtons.filter((a) => a.show?.(record) ?? true);
      const visibleMenu = menuItems.filter((a) => a.show?.(record) ?? true);

      return (
        <div className="flex items-center justify-end gap-0.5">
          {visibleInline.map((action) => {
            const disabled = action.disabled?.(record) ?? false;
            const reason = disabled ? (action.disabledReason?.(record) ?? null) : null;
            return (
              <Button
                aria-label={action.label}
                className="h-8 px-2.5 text-xs"
                disabled={disabled}
                key={action.label}
                onClick={() => void action.onClick(record)}
                size="sm"
                title={reason ?? action.label}
                variant="ghost"
              >
                {action.label}
              </Button>
            );
          })}
          {visibleMenu.length > 0 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="更多操作"
                  className="h-8 pl-2.5 pr-0 text-xs"
                  size="sm"
                  title="更多操作"
                  variant="ghost"
                >
                  更多
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{opts.menuLabel ?? "更多操作"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {visibleMenu.map((item, index) => {
                  const itemDisabled = item.disabled?.(record) ?? false;
                  const itemReason = itemDisabled ? (item.disabledReason?.(record) ?? null) : null;
                  return (
                    <div key={item.label}>
                      {item.separator === "before" && index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        disabled={itemDisabled}
                        onSelect={() => void item.onClick(record)}
                        title={itemReason ?? undefined}
                        variant={item.variant}
                      >
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
