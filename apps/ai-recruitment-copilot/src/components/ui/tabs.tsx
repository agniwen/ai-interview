"use client";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import * as React from "react";

import { cn } from "@arc/shared/utils";

type BaseTabsRootProps = React.ComponentProps<typeof TabsPrimitive.Root>;
type BaseTabsChangeDetails = Parameters<NonNullable<BaseTabsRootProps["onValueChange"]>>[1];
type TabsActivationMode = "automatic" | "manual";
type TabsListVariant = "default" | "line";

interface TabsContextValue {
  activationMode: TabsActivationMode;
  layoutId: string;
}

interface TabsListContextValue {
  variant: TabsListVariant;
}

const TabsContext = React.createContext<TabsContextValue>({
  activationMode: "automatic",
  layoutId: "tabs-indicator",
});
const TabsListContext = React.createContext<TabsListContextValue>({ variant: "default" });

const tabsIndicatorTransition: Transition = {
  damping: 24,
  mass: 1.2,
  stiffness: 170,
  type: "spring",
};

function Tabs({
  activationMode = "automatic",
  className,
  onValueChange,
  orientation = "horizontal",
  ...props
}: Omit<BaseTabsRootProps, "onValueChange"> & {
  activationMode?: TabsActivationMode;
  onValueChange?: (value: string, eventDetails: BaseTabsChangeDetails) => void;
}) {
  const layoutId = React.useId();
  const reduceMotion = useReducedMotion();

  return (
    <MotionConfig transition={reduceMotion ? { duration: 0 } : tabsIndicatorTransition}>
      <TabsContext.Provider value={{ activationMode, layoutId }}>
        <TabsPrimitive.Root
          data-slot="tabs"
          data-orientation={orientation}
          orientation={orientation}
          render={<motion.div layoutRoot />}
          className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
          onValueChange={(value, eventDetails) => {
            if (value !== null && value !== undefined) {
              onValueChange?.(value as string, eventDetails);
            }
          }}
          {...props}
        />
      </TabsContext.Provider>
    </MotionConfig>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground data-[orientation=horizontal]:h-9 data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[variant=line]:rounded-none",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
  },
);

function TabsList({
  activateOnFocus,
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const { activationMode } = React.useContext(TabsContext);
  const resolvedVariant = variant ?? "default";

  return (
    <TabsListContext.Provider value={{ variant: resolvedVariant }}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolvedVariant}
        activateOnFocus={activateOnFocus ?? activationMode === "automatic"}
        className={cn(tabsListVariants({ variant: resolvedVariant }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  );
}

function TabsTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  const { layoutId } = React.useContext(TabsContext);
  const { variant } = React.useContext(TabsListContext);

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={(state) =>
        cn(
          "relative isolate inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 overflow-visible rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 group-data-[variant=default]/tabs-list:data-[active]:shadow-none group-data-[variant=line]/tabs-list:data-[active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[active]:bg-transparent",
          "data-[active]:text-foreground",
          typeof className === "function" ? className(state) : className,
        )
      }
      render={(renderProps, state) => {
        const indicator =
          state.active && variant === "line" ? (
            <motion.span
              layoutId={layoutId}
              className={cn(
                "absolute bg-foreground",
                state.orientation === "vertical"
                  ? "inset-y-0 -right-1 w-0.5"
                  : "-bottom-[5px] right-0 left-0 h-0.5",
              )}
            />
          ) : state.active ? (
            <motion.span
              layoutId={layoutId}
              className="pointer-events-none absolute inset-0 -z-10 rounded-md bg-background shadow-sm"
            />
          ) : null;

        return (
          <button {...renderProps}>
            {indicator}
            {children}
          </button>
        );
      }}
      {...props}
    />
  );
}

function TabsContent({
  className,
  forceMount,
  keepMounted,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Panel> & { forceMount?: boolean }) {
  const reduceMotion = useReducedMotion();

  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted={keepMounted ?? forceMount}
      className={cn("flex-1 outline-none data-[ending-style]:hidden", className)}
      render={
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        />
      }
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger };
