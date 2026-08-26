"use client";

import "@ncdai/react-wheel-picker/style.css";

import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import * as WheelPickerPrimitive from "@ncdai/react-wheel-picker";

import { cn } from "@arc/shared/utils";

type WheelPickerValue = WheelPickerPrimitive.WheelPickerValue;

type WheelPickerOption<T extends WheelPickerValue = string> =
  WheelPickerPrimitive.WheelPickerOption<T>;

type WheelPickerClassNames = WheelPickerPrimitive.WheelPickerClassNames;

function WheelPickerWrapper({
  className,
  ...props
}: ComponentProps<typeof WheelPickerPrimitive.WheelPickerWrapper>) {
  return (
    <WheelPickerPrimitive.WheelPickerWrapper
      className={cn("rounded-lg bg-background tabular-nums", className)}
      {...props}
    />
  );
}

function WheelPicker<T extends WheelPickerValue = string>({
  "aria-label": label,
  classNames,
  ...props
}: WheelPickerPrimitive.WheelPickerProps<T> & { "aria-label": string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIndex = props.options.findIndex((option) => option.value === props.value);
  const selectedOption = props.options[selectedIndex];
  const valueText = selectedOption?.textValue ?? String(selectedOption?.label ?? props.value ?? "");

  // The primitive does not forward DOM/ARIA props to its focusable wheel.
  useEffect(() => {
    const wheel = containerRef.current?.querySelector("[data-rwp]");
    if (!wheel) {
      return;
    }
    wheel.setAttribute("role", "spinbutton");
    wheel.setAttribute("aria-label", label);
    wheel.setAttribute("aria-valuemin", "0");
    wheel.setAttribute("aria-valuemax", String(props.options.length - 1));
    wheel.setAttribute("aria-valuenow", String(Math.max(0, selectedIndex)));
    wheel.setAttribute("aria-valuetext", valueText);
    for (const list of wheel.querySelectorAll("ul")) {
      list.setAttribute("aria-hidden", "true");
    }
  }, [label, props.options.length, selectedIndex, valueText]);

  return (
    <div className="min-w-0 flex-1" ref={containerRef}>
      <WheelPickerPrimitive.WheelPicker
        classNames={{
          highlightItem: cn("data-disabled:opacity-40", classNames?.highlightItem),
          highlightWrapper: cn(
            "rounded-md bg-accent text-accent-foreground",
            "data-rwp-focused:inset-ring-2 data-rwp-focused:inset-ring-ring",
            classNames?.highlightWrapper,
          ),
          optionItem: cn("text-muted-foreground data-disabled:opacity-40", classNames?.optionItem),
        }}
        {...props}
      />
    </div>
  );
}

export { WheelPicker, WheelPickerWrapper };
export type { WheelPickerClassNames, WheelPickerOption };
