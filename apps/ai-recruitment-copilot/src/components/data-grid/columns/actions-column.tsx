// src/components/data-grid/columns/actions-column.tsx
import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataGridFeatures } from "../table-features";

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

/** TableCell `p-2.5` → 10px × 2. */
const ACTION_CELL_HORIZONTAL_PADDING = 20;
/** Button `px-2.5` → 10px × 2. */
const ACTION_BUTTON_HORIZONTAL_PADDING = 20;
/** Flex gap between action buttons (`gap-0.5`). */
const ACTION_BUTTON_GAP = 2;
/** Extra header inset matching the final button's right padding (`pr-2.5`). */
const ACTION_HEADER_EXTRA_RIGHT_PADDING = 10;
const MIN_ACTION_COLUMN_SIZE = 44;
const HEADER_LABEL = "操作";

function estimateActionLabelWidth(label: string) {
  let width = 0;
  for (const char of label) {
    if (char === " ") {
      width += 4;
      continue;
    }
    // text-xs (~12px): CJK ≈ 12px, Latin ≈ 7px.
    width += (char.codePointAt(0) ?? 0) <= 127 ? 7 : 12;
  }
  return width;
}

/** Shared sizing helper for custom action cells and the standard actions column. */
export function estimateActionsColumnSize(opts: {
  inlineLabels?: string[];
  hasMenu?: boolean;
  headerLabel?: string;
}): number {
  const inlineLabels = opts.inlineLabels ?? [];
  const hasMenu = opts.hasMenu ?? false;
  const headerLabel = opts.headerLabel ?? HEADER_LABEL;
  const actionCount = inlineLabels.length + (hasMenu ? 1 : 0);

  let inlineWidth = 0;
  for (const label of inlineLabels) {
    inlineWidth += estimateActionLabelWidth(label) + ACTION_BUTTON_HORIZONTAL_PADDING;
  }
  const menuWidth = hasMenu
    ? estimateActionLabelWidth("更多") + ACTION_BUTTON_HORIZONTAL_PADDING
    : 0;
  const gapWidth = Math.max(actionCount - 1, 0) * ACTION_BUTTON_GAP;
  const contentWidth = Math.ceil(
    inlineWidth + menuWidth + gapWidth + ACTION_CELL_HORIZONTAL_PADDING,
  );
  const headerWidth = Math.ceil(
    estimateActionLabelWidth(headerLabel) +
      ACTION_CELL_HORIZONTAL_PADDING +
      ACTION_HEADER_EXTRA_RIGHT_PADDING,
  );

  return Math.max(MIN_ACTION_COLUMN_SIZE, contentWidth, headerWidth);
}

export function ActionsColumnHeader({ children }: { children: ReactNode }) {
  return <div className="pr-2.5 text-right">{children}</div>;
}

export function actionsColumn<TData extends RowData>(
  opts: ActionsColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  const inlineButtons = opts.inline ?? [];
  const menuItems = opts.menu ?? [];
  const headerLabel = opts.title ?? HEADER_LABEL;
  // Action buttons are text-only in tables; estimate enough width for labels.
  // 表格 action 按钮统一纯文字展示，列宽按 label 文本估算。
  const inferredSize = estimateActionsColumnSize({
    hasMenu: menuItems.length > 0,
    headerLabel,
    inlineLabels: inlineButtons.map((action) => action.label),
  });
  const size = opts.size ?? inferredSize;

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
                variant="text"
              >
                {action.label}
              </Button>
            );
          })}
          {visibleMenu.length > 0 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="更多操作"
                    className="h-8 px-2.5 text-xs"
                    size="sm"
                    title="更多操作"
                    variant="text"
                  >
                    更多
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{opts.menuLabel ?? "更多操作"}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {visibleMenu.map((item, index) => {
                  const itemDisabled = item.disabled?.(record) ?? false;
                  const itemReason = itemDisabled ? (item.disabledReason?.(record) ?? null) : null;
                  return (
                    <div key={item.label}>
                      {item.separator === "before" && index > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        disabled={itemDisabled}
                        onClick={() => void item.onClick(record)}
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
    enableSorting: false,
    header: () => <ActionsColumnHeader>{headerLabel}</ActionsColumnHeader>,
    id: opts.id ?? "actions",
    // Lock width so the last action column stays content-sized instead of absorbing leftover table width.
    maxSize: size,
    minSize: size,
    size,
  };
}
