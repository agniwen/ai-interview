"use client";

import { IconUserMinus, IconX } from "@tabler/icons-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FloatingBar } from "@/components/ui/floating-bar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

const BULK_MANAGER_SELECT_ID = "bulk-member-manager";

/**
 * 成员多选后的浮动操作条：与招聘台一致悬浮在底部，出现时不推动表格布局。
 * Floating bulk actions for selected members; floats like the recruiting desk bar so the
 * table never shifts when a selection starts.
 */
export function MembersFloatingActionBar({
  disabled,
  managerOptions,
  onClearManager,
  onClearSelection,
  onSetManager,
  selectedCount,
}: {
  disabled: boolean;
  managerOptions: SearchableSelectOption[];
  onClearManager: () => void;
  onClearSelection: () => void;
  onSetManager: (managerUserId: string) => void;
  selectedCount: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {selectedCount > 0 ? (
        <m.div
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none fixed right-4 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-4 z-40 flex justify-center"
          exit={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <FloatingBar className="flex items-center gap-(--floating-bar-inset) p-1">
            <span className="select-none whitespace-nowrap px-2.5 text-muted-foreground text-sm">
              已选择 {selectedCount} 人
            </span>
            <label className="sr-only" htmlFor={BULK_MANAGER_SELECT_ID}>
              批量设置直属上级
            </label>
            <SearchableSelect
              clearable={false}
              contentSide="top"
              disabled={disabled}
              emptyMessage="没有可选的上级"
              id={BULK_MANAGER_SELECT_ID}
              modal={false}
              onChange={(value) => {
                if (value) {
                  onSetManager(value);
                }
              }}
              options={managerOptions}
              placeholder="批量设置直属上级"
              searchPlaceholder="搜索成员"
              triggerClassName="h-8 w-52"
              value={null}
            />
            <Button disabled={disabled} onClick={onClearManager} size="sm" variant="outline">
              <IconUserMinus data-icon="inline-start" />
              清除上级
            </Button>
            <Button onClick={onClearSelection} size="sm" variant="outline">
              <IconX data-icon="inline-start" />
              取消选择
            </Button>
          </FloatingBar>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
