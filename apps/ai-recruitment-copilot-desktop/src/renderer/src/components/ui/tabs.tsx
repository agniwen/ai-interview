"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";

import { cn } from "@arc/shared/utils";

export type TabsVariant = "default" | "underline";
type TabsListVariant = TabsVariant | "line";
type TabsActivationMode = "automatic" | "manual";

const TabsContext = React.createContext<{ activationMode: TabsActivationMode }>({
  activationMode: "automatic",
});

export function Tabs({
  activationMode = "automatic",
  className,
  ...props
}: TabsPrimitive.Root.Props & {
  activationMode?: TabsActivationMode;
}): React.ReactElement {
  return (
    <TabsContext.Provider value={{ activationMode }}>
      <TabsPrimitive.Root
        className={cn("flex flex-col gap-2 data-[orientation=vertical]:flex-row", className)}
        data-slot="tabs"
        {...props}
      />
    </TabsContext.Provider>
  );
}

export function TabsList({
  activateOnFocus,
  className,
  children,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsListVariant;
}): React.ReactElement {
  const { activationMode } = React.useContext(TabsContext);
  const resolvedVariant: TabsVariant = variant === "line" ? "underline" : variant;

  return (
    <TabsPrimitive.List
      activateOnFocus={activateOnFocus ?? activationMode === "automatic"}
      className={cn(
        "relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-muted-foreground",
        "data-[orientation=vertical]:flex-col",
        resolvedVariant === "default"
          ? "rounded-lg bg-muted p-0.5 text-muted-foreground/72"
          : "data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-tab]:hover:bg-accent",
        className,
      )}
      data-slot="tabs-list"
      data-variant={resolvedVariant}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          "absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) transition-[width,translate] duration-200 ease-in-out",
          resolvedVariant === "underline"
            ? "z-10 bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px data-[orientation=horizontal]:translate-y-px"
            : "-z-1 rounded-md bg-background dark:bg-input",
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative flex h-9 shrink-0 grow cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-[calc(--spacing(2.5)-1px)] font-medium text-base outline-none transition-[color,background-color,box-shadow] hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground data-disabled:opacity-64 sm:h-8 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  forceMount,
  keepMounted,
  ...props
}: TabsPrimitive.Panel.Props & { forceMount?: boolean }): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      keepMounted={keepMounted ?? forceMount}
      {...props}
    />
  );
}

export { TabsPrimitive, TabsPanel as TabsContent, TabsTab as TabsTrigger };
