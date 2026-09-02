import type { VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { Separator } from "@/components/ui/separator";
import { cn } from "@app/shared/utils";

// Ignore Base UI `[data-base-ui-focus-guard]` siblings (injected while Popover/Menu is open)
// so first/last real controls keep shared radius. Class names must stay full string
// literals for Tailwind scanning.
const buttonGroupVariants = cva(
  "flex w-fit items-stretch [&>*]:focus-visible:z-10 [&>*]:focus-visible:relative [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md has-[>[data-slot=button-group]]:gap-2",
  {
    defaultVariants: {
      orientation: "horizontal",
    },
    variants: {
      orientation: {
        horizontal:
          "[&>:not([data-base-ui-focus-guard])~:not([data-base-ui-focus-guard])]:rounded-l-none [&>:not([data-base-ui-focus-guard])~:not([data-base-ui-focus-guard])]:border-l-0 [&>:not([data-base-ui-focus-guard]):has(~:not([data-base-ui-focus-guard]))]:rounded-r-none",
        vertical:
          "flex-col [&>:not([data-base-ui-focus-guard])~:not([data-base-ui-focus-guard])]:rounded-t-none [&>:not([data-base-ui-focus-guard])~:not([data-base-ui-focus-guard])]:border-t-0 [&>:not([data-base-ui-focus-guard]):has(~:not([data-base-ui-focus-guard]))]:rounded-b-none",
      },
    },
  },
);

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "relative flex items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  });
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "bg-input relative !m-0 self-stretch data-[orientation=vertical]:h-auto",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
