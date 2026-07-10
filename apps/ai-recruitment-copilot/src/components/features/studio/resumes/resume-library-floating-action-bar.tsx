"use client";

import { IconEye, IconTrash, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { ScrollArea } from "@/components/ui/scroll-area";

const FLOATING_ACTION_GLASS_CLASS = `relative border border-border/40 bg-background/32 bg-clip-padding shadow-[0_18px_54px_-28px_rgb(0_0_0/0.45)] backdrop-blur-lg ${cossControlOverlayClass}`;
const FLOATING_ACTION_LIST_CLASS =
  "border border-border/70 bg-background/95 bg-clip-padding shadow-[0_14px_42px_-30px_rgb(0_0_0/0.38)]";

interface ResumeLibraryFloatingActionItem {
  id: string;
  jobDescriptionLabel: string | null;
  name: string;
}

interface ResumeLibraryFloatingActionBarProps {
  disabled?: boolean;
  disabledReason?: string;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onRemoveItem: (id: string) => void;
  onViewItem: (id: string) => void;
  selectedItems: ResumeLibraryFloatingActionItem[];
  selectedCount: number;
}

export function ResumeLibraryFloatingActionBar({
  disabled,
  disabledReason,
  onClearSelection,
  onBulkDelete,
  onRemoveItem,
  onViewItem,
  selectedItems,
  selectedCount,
}: ResumeLibraryFloatingActionBarProps) {
  const reduceMotion = useReducedMotion();
  const visible = selectedCount > 0;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed right-4 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-center justify-center gap-2 pointer-events-none"
          exit={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div
            className={`pointer-events-auto w-full max-w-lg overflow-hidden rounded-md p-1 ${FLOATING_ACTION_LIST_CLASS}`}
          >
            <ScrollArea className="max-h-[7.75rem]" scrollbars="leave">
              {selectedItems.map((item) => (
                <div
                  className="group grid min-h-10 grid-cols-[minmax(0,1fr)_minmax(6rem,13rem)_auto] items-center gap-2 rounded-sm px-2.5 py-1 text-xs transition-colors hover:bg-muted/55"
                  key={item.id}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {item.jobDescriptionLabel ?? "未匹配岗位"}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
                    <Button
                      aria-label={`查看 ${item.name}`}
                      onClick={() => onViewItem(item.id)}
                      size="icon-xs"
                      title="查看"
                      type="button"
                      variant="ghost"
                    >
                      <IconEye />
                    </Button>
                    <Button
                      aria-label={`取消选择 ${item.name}`}
                      onClick={() => onRemoveItem(item.id)}
                      size="icon-xs"
                      title="取消选择"
                      type="button"
                      variant="ghost"
                    >
                      <IconX />
                    </Button>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>
          <div
            className={`pointer-events-auto inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md p-1 ${FLOATING_ACTION_GLASS_CLASS}`}
          >
            <div className="select-none whitespace-nowrap px-2.5 text-muted-foreground text-sm">
              已选择 {selectedCount} 条
            </div>
            <Button onClick={onClearSelection} type="button" variant="ghost">
              <IconX data-icon="inline-start" />
              取消选择
            </Button>
            <Button
              disabled={disabled}
              onClick={onBulkDelete}
              title={disabled ? disabledReason : undefined}
              type="button"
              variant="destructive"
            >
              <IconTrash data-icon="inline-start" />
              批量删除
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
