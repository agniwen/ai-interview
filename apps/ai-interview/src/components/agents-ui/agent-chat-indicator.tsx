import type { VariantProps } from "class-variance-authority";
import type { MotionProps } from "motion/react";
import type { ComponentProps, Ref } from "react";
import { cva } from "class-variance-authority";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const motionAnimationProps = {
  animate: "visible",
  exit: "hidden",
  initial: "hidden",
  variants: {
    hidden: {
      opacity: 0,
      scale: 0.1,
      transition: {
        duration: 0.1,
        ease: "linear" as const,
      },
    },
    visible: {
      opacity: [0.5, 1],
      scale: [1, 1.2],
      transition: {
        bounce: 0,
        duration: 0.5,
        repeat: Infinity,
        repeatType: "mirror" as const,
        type: "spring" as const,
      },
    },
  },
};

const agentChatIndicatorVariants = cva("bg-muted-foreground inline-block size-2.5 rounded-full", {
  defaultVariants: {
    size: "md",
  },
  variants: {
    size: {
      lg: "size-6",
      md: "size-4",
      sm: "size-2.5",
    },
  },
});

/**
 * Props for the AgentChatIndicator component.
 */
export interface AgentChatIndicatorProps extends MotionProps {
  /**
   * The size of the indicator dot.
   * @defaultValue 'md'
   */
  size?: "sm" | "md" | "lg";
  /**
   * Additional CSS class names to apply to the indicator.
   */
  className?: string;
  /**
   * Allows getting a ref to the component instance.\nOnce the component unmounts, React will set `ref.current` to `null`\n(or call the ref with `null` if you passed a callback ref).\n@see {@link https://react.dev/learn/referencing-values-with-refs#refs-and-the-dom React Docs}
   */
  ref?: Ref<HTMLSpanElement>;
}

/**
 * An animated indicator that shows the agent is processing or thinking.
 * Displays as a pulsing dot, typically used in chat interfaces.
 *
 * @extends ComponentProps<'span'>
 *
 * @example
 * ```tsx
 * {agentState === 'thinking' && <AgentChatIndicator size="md" />}
 * ```
 */
export function AgentChatIndicator({
  size = "md",
  className,
  ...props
}: AgentChatIndicatorProps &
  ComponentProps<"span"> &
  VariantProps<typeof agentChatIndicatorVariants>) {
  return (
    <motion.span
      {...motionAnimationProps}
      transition={{ duration: 0.1, ease: "linear" as const }}
      className={cn(agentChatIndicatorVariants({ size }), className)}
      {...props}
    />
  );
}
