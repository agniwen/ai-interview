"use client";

/**
 * Hero UI v3 Tabs (compound API).
 *
 *   <Tabs selectedKey={key} onSelectionChange={setKey}>
 *     <Tabs.ListContainer>
 *       <Tabs.List aria-label="...">
 *         <Tabs.Tab id="overview">
 *           Overview
 *           <Tabs.Indicator />
 *         </Tabs.Tab>
 *         <Tabs.Tab id="settings">
 *           Settings
 *           <Tabs.Indicator />
 *         </Tabs.Tab>
 *       </Tabs.List>
 *     </Tabs.ListContainer>
 *     <Tabs.Panel id="overview">{...}</Tabs.Panel>
 *     <Tabs.Panel id="settings">{...}</Tabs.Panel>
 *   </Tabs>
 *
 * The `<Tabs.Indicator />` placed inside each `<Tabs.Tab>` renders the
 * highlight pill that visually marks the active tab.
 */
export { Tabs, type TabsProps } from "@heroui/react";
