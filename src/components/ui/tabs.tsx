"use client";

import { Tabs as HeroTabs, type TabsProps } from "@heroui/react";
import { useEffect, useState, type ComponentProps, type JSX } from "react";

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
 *       </Tabs.List>
 *     </Tabs.ListContainer>
 *     <Tabs.Panel id="overview">{...}</Tabs.Panel>
 *   </Tabs>
 *
 * `Tabs.Indicator` is wrapped to defer rendering by one paint frame after
 * mount. Without this, react-aria's SharedElement framework flashes the
 * indicator at its raw CSS size (width:100% / height:100% of containing
 * block) on the first paint before the FLIP measurement settles — under
 * certain layouts (e.g. /studio sidebar tabs after refresh) that brief
 * "unsettled" state escaped the Tab and visually filled the whole TabList
 * row. Deferring trades a single missing entry animation on first paint
 * for a stable initial position, which is the right call here.
 */

type IndicatorProps = ComponentProps<typeof HeroTabs.Indicator>;

function Indicator(props: IndicatorProps): JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <HeroTabs.Indicator {...props} />;
}

function TabsRoot(props: TabsProps) {
  return <HeroTabs {...props} />;
}

const Tabs = Object.assign(TabsRoot, {
  Root: HeroTabs.Root,
  ListContainer: HeroTabs.ListContainer,
  List: HeroTabs.List,
  Tab: HeroTabs.Tab,
  Indicator,
  Separator: HeroTabs.Separator,
  Panel: HeroTabs.Panel,
});

export { Tabs, type TabsProps };
