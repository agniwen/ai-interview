"use client";

import { IconTrash } from "@tabler/icons-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cossWhisperShadowClass } from "@/components/ui/coss-style";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ResumeLibraryFloatingActionBarProps {
  disabled?: boolean;
  disabledReason?: string;
  onBulkDelete: () => void;
  selectedCount: number;
}

export function ResumeLibraryFloatingActionBar({
  disabled,
  disabledReason,
  onBulkDelete,
  selectedCount,
}: ResumeLibraryFloatingActionBarProps) {
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
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-md border border-border/50 bg-background/80 bg-clip-padding p-1 backdrop-blur-lg ${cossWhisperShadowClass}`}
          >
            <span className="select-none whitespace-nowrap px-2.5 text-sm text-muted-foreground">
              已选择 {selectedCount} 条
            </span>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  className="max-md:h-11 max-md:px-4 max-md:text-sm"
                  disabled={disabled}
                  onClick={onBulkDelete}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <IconTrash data-icon="inline-start" />
                  批量删除
                </Button>
              </TooltipTrigger>
              {disabled && disabledReason ? (
                <TooltipContent>{disabledReason}</TooltipContent>
              ) : null}
            </Tooltip>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
