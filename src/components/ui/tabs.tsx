"use client";

import type { Key, ReactNode } from "react";
import {
  Tab as HeroTab,
  TabList as HeroTabList,
  TabPanel as HeroTabPanel,
  Tabs as HeroTabs,
} from "@heroui/react";
import { cva } from "class-variance-authority";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export type TabsProps = AnyProps & {
  value?: Key;
  defaultValue?: Key;
  onValueChange?: (value: string) => void;
  selectedKey?: Key | null;
  onSelectionChange?: (key: Key) => void;
  children?: ReactNode;
};

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  selectedKey,
  onSelectionChange,
  ...props
}: TabsProps) {
  const heroSelectedKey = selectedKey ?? (value as Key | undefined);
  const heroOnChange = (key: Key) => {
    onSelectionChange?.(key);
    onValueChange?.(String(key));
  };
  return (
    <HeroTabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
      selectedKey={heroSelectedKey}
      defaultSelectedKey={defaultValue as Key | undefined}
      onSelectionChange={heroOnChange}
    />
  );
}

export type TabsListProps = AnyProps & { children?: ReactNode; className?: string };
export function TabsList(props: TabsListProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroTabList {...(props as any)} />;
}

export type TabsTriggerProps = AnyProps & {
  value?: Key;
  children?: ReactNode;
  className?: string;
};
export function TabsTrigger({ value, ...props }: TabsTriggerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroTab id={value} {...(props as any)} />;
}

export type TabsContentProps = AnyProps & {
  value?: Key;
  children?: ReactNode;
  className?: string;
};
export function TabsContent({ value, ...props }: TabsContentProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <HeroTabPanel id={value} {...(props as any)} />;
}

/** Legacy cva — preserved for any consumer doing VariantProps<typeof tabsListVariants>. */
export const tabsListVariants = cva("", {
  defaultVariants: { variant: "default" },
  variants: {
    variant: { default: "", line: "" },
  },
});
