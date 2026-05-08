"use client";

/**
 * Direct re-export of Hero UI v3 Tabs primitives. Use Hero UI's native compositional API:
 *
 *   <Tabs selectedKey={key} onSelectionChange={setKey}>
 *     <TabList>
 *       <Tab id="overview">Overview</Tab>
 *       <Tab id="settings">Settings</Tab>
 *     </TabList>
 *     <TabPanel id="overview">{...}</TabPanel>
 *     <TabPanel id="settings">{...}</TabPanel>
 *   </Tabs>
 */
export {
  Tab,
  TabIndicator,
  TabList,
  TabListContainer,
  TabPanel,
  TabSeparator,
  Tabs,
  type TabListContainerProps,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "@heroui/react";
