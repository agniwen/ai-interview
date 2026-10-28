import type { VariantProps } from "class-variance-authority";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { Separator } from "@/components/ui/separator";
import { cn } from "@app/shared/utils";

// Ignore Base UI focus guards and hidden portal ownership spans inserted by open menus.
// Only real controls should affect shared corners. Class names must stay full string
// literals for Tailwind scanning.
const buttonGroupVariants = cva(
  "flex w-fit items-stretch [&>*]:focus-visible:z-10 [&>*]:focus-visible:relative [&>*]:has-focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg has-[>[data-slot=button-group]]:gap-2",
  {
    compoundVariants: [
      {
        attached: true,
        orientation: "horizontal",
        className: "[&>*~*]:border-l-(--control-ring)",
      },
      {
        attached: true,
        orientation: "vertical",
        className: "[&>*~*]:border-t-(--control-ring)",
      },
    ],
    defaultVariants: {
      orientation: "horizontal",
      attached: false,
    },
    variants: {
      // 拼接成一个控件（字段名 + 值）：外框和投影由整组画一次，与按钮同一个 shadow-default，
      // 所以高度、描边和投影都和旁边的按钮一致；分段之间只画一条同色分隔线。
      // 放在 ::after 上，是为了暗色的内描边盖在各分段底色之上；聚焦分段的 z-10 仍在它上方。
      // Fused into one control: the group draws the same shadow-default as a button once (on
      // ::after so dark inset rings sit above segment fills); segments only draw a same-colour divider.
      attached: {
        true: "relative rounded-lg [&>*]:shadow-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-default",
        false: "",
      },
      orientation: {
        horizontal:
          "[&>:not([data-base-ui-focus-guard]):not(span[aria-owns])~:not([data-base-ui-focus-guard]):not(span[aria-owns])]:rounded-l-none [&>:not([data-base-ui-focus-guard]):not(span[aria-owns]):has(~:not([data-base-ui-focus-guard]):not(span[aria-owns]))]:rounded-r-none",
        vertical:
          "flex-col [&>:not([data-base-ui-focus-guard]):not(span[aria-owns])~:not([data-base-ui-focus-guard]):not(span[aria-owns])]:rounded-t-none [&>:not([data-base-ui-focus-guard]):not(span[aria-owns]):has(~:not([data-base-ui-focus-guard]):not(span[aria-owns]))]:rounded-b-none",
      },
    },
  },
);

function ButtonGroup({
  attached,
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ attached, orientation }), className)}
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
          "relative flex items-center gap-2 rounded-lg border border-transparent bg-control px-3 text-[13px] leading-5 font-medium shadow-default [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
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
