"use client";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";

import { cn } from "@arc/shared/utils";

type BaseTabsRootProps = React.ComponentProps<typeof TabsPrimitive.Root>;
type BaseTabsChangeDetails = Parameters<NonNullable<BaseTabsRootProps["onValueChange"]>>[1];
type TabsActivationMode = "automatic" | "manual";

interface TabsContextValue {
  activationMode: TabsActivationMode;
}

const TabsContext = React.createContext<TabsContextValue>({ activationMode: "automatic" });

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
  return (
    <TabsContext.Provider value={{ activationMode }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
        onValueChange={(value, eventDetails) => {
          if (value !== null && value !== undefined) {
            onValueChange?.(value as string, eventDetails);
          }
        }}
        {...props}
      />
    </TabsContext.Provider>
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

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      activateOnFocus={activateOnFocus ?? activationMode === "automatic"}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 group-data-[variant=default]/tabs-list:data-[active]:shadow-sm group-data-[variant=line]/tabs-list:data-[active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[active]:bg-transparent",
        "data-[active]:bg-background data-[active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:bottom-[-5px] data-[orientation=horizontal]:after:h-0.5 data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:-right-1 data-[orientation=vertical]:after:w-0.5 group-data-[variant=line]/tabs-list:data-[active]:after:opacity-100",
        className,
      )}
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
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted={keepMounted ?? forceMount}
      className={cn("flex-1 outline-none data-[ending-style]:hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger };
