"use client";

import type { ComponentProps } from "react";
import {
  Tab,
  TabIndicator,
  TabList as HeroTabList,
  TabListContainer,
  TabPanel,
  TabSeparator,
  Tabs,
  type TabListContainerProps,
  type TabListProps as HeroTabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "@heroui/react";

/**
 * Hero UI v3 Tabs primitives.
 *
 *   <Tabs selectedKey={key} onSelectionChange={setKey}>
 *     <TabList>
 *       <Tab id="overview">Overview</Tab>
 *       <Tab id="settings">Settings</Tab>
 *     </TabList>
 *     <TabPanel id="overview">{...}</TabPanel>
 *     <TabPanel id="settings">{...}</TabPanel>
 *   </Tabs>
 *
 * Our `TabList` automatically renders a `<TabIndicator />` after the tab
 * children so the moving highlight pill (the segment-style background that
 * marks the active tab) shows up without callers having to add it manually.
 */

export type TabListProps = ComponentProps<typeof HeroTabList> & HeroTabListProps;

export function TabList({ children, ...props }: TabListProps) {
  return (
    <HeroTabList {...props}>
      {children}
      <TabIndicator />
    </HeroTabList>
  );
}

export {
  Tab,
  TabIndicator,
  TabListContainer,
  TabPanel,
  TabSeparator,
  Tabs,
  type TabListContainerProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
};
