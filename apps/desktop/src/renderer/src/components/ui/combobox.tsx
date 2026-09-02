"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  cossFieldSurfaceClass,
  cossMenuItemClass,
  cossPopupSurfaceClass,
} from "@/components/ui/coss-style";
import { Icon } from "@/components/ui/icon";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@app/shared/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "relative z-10 [&_svg]:relative [&_svg]:z-10 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <Icon
        data-slot="combobox-trigger-icon"
        className="pointer-events-none relative z-10 size-4 text-muted-foreground"
        icon="ph:caret-down"
      />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxTriggerButton({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof InputGroupButton>,
  "children" | "render" | "size" | "variant"
>) {
  return (
    <InputGroupButton
      className={cn("data-pressed:bg-transparent", className)}
      render={<ComboboxTrigger />}
      size="icon-xs"
      variant="ghost"
      {...props}
    />
  );
}

function ComboboxClearButton({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof InputGroupButton>,
  "children" | "render" | "size" | "variant"
>) {
  return (
    <InputGroupButton className={cn(className)} size="icon-xs" variant="ghost" {...props}>
      <Icon className="pointer-events-none relative z-10 text-muted-foreground" icon="ph:x" />
    </InputGroupButton>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  clearVisible,
  onClear,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
  clearVisible?: boolean;
  onClear?: () => void;
}) {
  // Base UI positions the popup against `inputGroupElement` when present, otherwise
  // the bare <input>. Without Combobox.InputGroup the anchor shrinks to the text
  // field only (excluding start/end addons like avatars and the chevron), so the
  // menu looks misaligned relative to the full control. Register the styled
  // InputGroup as the combobox input-group so --anchor-width and align match the
  // visible trigger.
  return (
    <ComboboxPrimitive.InputGroup render={<InputGroup className={cn("w-auto", className)} />}>
      <ComboboxPrimitive.Input
        render={<InputGroupInput className="pr-14" disabled={disabled} />}
        {...props}
      />
      <div
        className="!absolute inset-y-0 right-1 flex items-center gap-0.5"
        data-slot="combobox-actions"
      >
        {showClear && clearVisible ? (
          <ComboboxClearButton
            aria-label="清空"
            data-slot="combobox-clear"
            disabled={disabled}
            onClick={onClear}
            onMouseDown={(event) => event.preventDefault()}
          />
        ) : null}
        {showTrigger ? (
          <ComboboxTriggerButton data-slot="input-group-button" disabled={disabled} />
        ) : null}
      </div>
      {children}
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  collisionAvoidance,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionAvoidance"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        collisionAvoidance={collisionAvoidance}
        // Above dialog overlay/content (z-[300]) so pickers work inside modals.
        className="pointer-events-auto isolate z-[350]"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            cossPopupSurfaceClass,
            "t-dropdown group/combobox-content pointer-events-auto max-h-96 w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] overflow-hidden data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(calc(--spacing(96)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        cossMenuItemClass,
        "w-full py-1.5 pr-8 pl-2 data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <Icon className="pointer-events-none size-4 pointer-coarse:size-5" icon="ph:check" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn(
        "px-2 py-1.5 text-xs text-muted-foreground pointer-coarse:px-3 pointer-coarse:py-2 pointer-coarse:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        cossFieldSurfaceClass,
        "inline-flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 px-2.5 py-0 text-base focus-within:shadow-[0_1px_1px_0_--theme(--color-foreground/16%)] has-aria-invalid:ring-[3px] has-data-[slot=combobox-chip]:px-1.5 has-data-[slot=combobox-chip]:py-1 md:text-sm [&>*]:relative [&>*]:z-10",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.5))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="-ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <Icon className="pointer-events-none relative z-10" icon="ph:x" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, children, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn(
        "h-full min-w-16 flex-1 rounded-[inherit] bg-transparent py-1 outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClearButton,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxTriggerButton,
  ComboboxValue,
  useComboboxAnchor,
};
