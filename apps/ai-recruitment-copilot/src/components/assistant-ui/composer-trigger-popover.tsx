"use client";

/**
 * PROTOTYPE — local-only mention/slash picker UI for assistant-ui TriggerPopover.
 * Adapted from assistant-ui's ComposerTriggerPopover; keep until productized.
 */

import { memo } from "react";
import type { ComponentPropsWithoutRef, FC } from "react";
import { ComposerPrimitive, unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import type { Unstable_DirectiveFormatter, Unstable_TriggerItem } from "@assistant-ui/react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@arc/shared/utils";

type IconComponent = FC<{ className?: string }>;

interface DirectiveBehaviorProps {
  formatter?: Unstable_DirectiveFormatter;
  onInserted?: (item: Unstable_TriggerItem) => void;
}

interface ActionBehaviorProps {
  formatter?: Unstable_DirectiveFormatter;
  onExecute: (item: Unstable_TriggerItem) => void;
  removeOnExecute?: boolean;
}

type ComposerTriggerPopoverBaseProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  char: string;
  adapter: NonNullable<
    ComponentPropsWithoutRef<typeof ComposerPrimitive.Unstable_TriggerPopover>["adapter"]
  >;
  isLoading?: boolean;
  iconMap?: Record<string, IconComponent>;
  fallbackIcon?: IconComponent;
  backLabel?: string;
  emptyCategoriesLabel?: string;
  emptyItemsLabel?: string;
  loadingLabel?: string;
};

type ComposerTriggerPopoverProps = ComposerTriggerPopoverBaseProps &
  (
    | { directive: DirectiveBehaviorProps; action?: never }
    | { action: ActionBehaviorProps; directive?: never }
  );

function Categories({ emptyLabel }: { emptyLabel: string }) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverCategories>
      {(categories) => (
        <div className="max-h-60 overflow-y-auto py-0.5">
          {categories.map((cat) => (
            <ComposerPrimitive.Unstable_TriggerPopoverCategoryItem
              categoryId={cat.id}
              className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs outline-none transition-colors hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted"
              key={cat.id}
            >
              <span className="truncate">{cat.label}</span>
              <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
            </ComposerPrimitive.Unstable_TriggerPopoverCategoryItem>
          ))}
          {categories.length === 0 ? (
            <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              {emptyLabel}
            </div>
          ) : null}
        </div>
      )}
    </ComposerPrimitive.Unstable_TriggerPopoverCategories>
  );
}

function Items({
  backLabel,
  emptyLabel,
  isLoading,
  loadingLabel,
}: {
  backLabel: string;
  emptyLabel: string;
  isLoading: boolean;
  loadingLabel: string;
}) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItems>
      {(items) => (
        <div className="inline-grid max-h-60 min-w-[10rem] max-w-[16rem] overflow-hidden bg-background">
          <ComposerPrimitive.Unstable_TriggerPopoverBack className="flex cursor-pointer items-center gap-1 border-border border-b bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground tracking-wide transition-colors hover:bg-muted">
            <IconChevronLeft className="size-3" />
            {backLabel}
          </ComposerPrimitive.Unstable_TriggerPopoverBack>
          <div className="grid max-h-60 overflow-y-auto bg-background py-0.5">
            {items.map((item, index) => (
              <ComposerPrimitive.Unstable_TriggerPopoverItem
                className="grid cursor-pointer gap-0.5 px-2.5 py-1.5 text-start outline-none transition-colors hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted"
                index={index}
                item={item}
                key={item.id}
              >
                <span className="truncate font-medium text-xs">{item.label}</span>
                {item.description ? (
                  <span className="truncate text-[10px] text-muted-foreground/70">
                    {item.description}
                  </span>
                ) : null}
              </ComposerPrimitive.Unstable_TriggerPopoverItem>
            ))}
            {items.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                {isLoading ? loadingLabel : emptyLabel}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </ComposerPrimitive.Unstable_TriggerPopoverItems>
  );
}

function ComposerTriggerPopoverImpl({
  action,
  adapter,
  backLabel = "返回",
  char,
  className,
  directive,
  emptyCategoriesLabel = "暂无分类",
  emptyItemsLabel = "没有匹配的候选人",
  fallbackIcon: _fallbackIcon,
  iconMap: _iconMap,
  isLoading = false,
  loadingLabel = "加载中…",
  ...props
}: ComposerTriggerPopoverProps) {
  "use no memo";
  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      adapter={adapter}
      char={char}
      className={cn(
        "aui-composer-trigger-popover absolute bottom-full left-0 z-[60] mb-1.5 w-max max-w-[16rem] overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-md",
        className,
      )}
      data-slot="composer-trigger-popover"
      isLoading={isLoading}
      {...props}
    >
      {directive ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Directive
          formatter={directive.formatter ?? unstable_defaultDirectiveFormatter}
          onInserted={directive.onInserted}
        />
      ) : (action ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Action
          formatter={action.formatter ?? unstable_defaultDirectiveFormatter}
          onExecute={action.onExecute}
          removeOnExecute={action.removeOnExecute}
        />
      ) : null)}
      <Categories emptyLabel={emptyCategoriesLabel} />
      <Items
        backLabel={backLabel}
        emptyLabel={emptyItemsLabel}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
      />
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
}

export const ComposerTriggerPopover = memo(ComposerTriggerPopoverImpl);
