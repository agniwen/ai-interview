"use client";

import { IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import * as React from "react";

import {
  cossAnchoredPopupMotionClass,
  cossPopupSurfaceClass,
  cossTriggerSurfaceClass,
} from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

type SelectRootItems = NonNullable<SelectPrimitive.Root.Props<unknown>["items"]>;
type SelectItemElementProps = React.ComponentProps<typeof SelectItem>;

function getFirstTextNode(children: React.ReactNode): string | null {
  let result: string | null = null;

  function visit(node: React.ReactNode): void {
    if (result !== null || node === null || node === undefined || typeof node === "boolean") {
      return;
    }
    if (typeof node === "string" || typeof node === "number") {
      const text = String(node).trim();
      if (text) {
        result = text;
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
        if (result !== null) {
          return;
        }
      }
      return;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      visit(node.props.children);
    }
  }

  visit(children);
  return result;
}

function getSelectItemLabel(children: React.ReactNode, label: string | undefined) {
  return label ?? getFirstTextNode(children) ?? children;
}

function collectSelectItems(
  children: React.ReactNode,
  records: { label: React.ReactNode; value: unknown }[],
) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return;
    }

    if (child.type === SelectItem) {
      const props = child.props as SelectItemElementProps;
      if (Object.hasOwn(props, "value")) {
        records.push({
          label: getSelectItemLabel(props.children, props.label),
          value: props.value,
        });
      }
    }

    collectSelectItems(child.props.children, records);
  });
}

function inferSelectItems(children: React.ReactNode): SelectRootItems | undefined {
  const records: { label: React.ReactNode; value: unknown }[] = [];
  collectSelectItems(children, records);
  return records.length > 0 ? records : undefined;
}

function Select<Value, Multiple extends boolean | undefined = false>({
  children,
  items,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const inferredItems = React.useMemo(() => items ?? inferSelectItems(children), [children, items]);

  return (
    <SelectPrimitive.Root items={inferredItems} {...props}>
      {children}
    </SelectPrimitive.Root>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn(className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn(className)} {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        cossTriggerSurfaceClass,
        "flex w-fit items-center justify-between gap-2 px-3 py-2 text-sm whitespace-nowrap data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 dark:hover:bg-input/50 *:relative *:z-10 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<IconChevronDown className="relative z-10 size-4 opacity-50" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignItemWithTrigger" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          // 嵌入 vaul Drawer 时让滚动正常生效；不在 drawer 中无副作用。
          // / Lets the select scroll inside vaul Drawer; harmless elsewhere.
          data-vaul-no-drag=""
          className={cn(
            cossPopupSurfaceClass,
            cossAnchoredPopupMotionClass,
            "relative isolate z-50 max-h-(--available-height) min-w-[8rem] touch-pan-y overflow-x-hidden overflow-y-auto data-[align-trigger=true]:w-(--anchor-width) data-[align-trigger=true]:transition-none",
            className,
          )}
          data-align-trigger={alignItemWithTrigger}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  label,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const itemLabel = label ?? getFirstTextNode(children) ?? undefined;

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      label={itemLabel}
      className={cn(
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator
        render={
          <span
            data-slot="select-item-indicator"
            className="absolute right-2 flex size-3.5 items-center justify-center"
          />
        }
      >
        <IconCheck className="size-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <IconChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <IconChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
