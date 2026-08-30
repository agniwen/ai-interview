import { ChromeIconButton } from "@/components/layout/chrome-icon-button";
import { Icon } from "@/components/ui/icon";
import { useSidebar } from "@/components/ui/sidebar";

/** Toggle sidebar expand/collapse — same glyph in both states. */
export function SidebarToggle(): React.JSX.Element {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <ChromeIconButton ariaLabel={collapsed ? "展开侧边栏" : "收起侧边栏"} onClick={toggleSidebar}>
      <Icon className="size-4" icon="ph:sidebar" />
    </ChromeIconButton>
  );
}
