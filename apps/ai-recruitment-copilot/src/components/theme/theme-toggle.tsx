"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";

const THEME_OPTIONS = [
  { icon: SunIcon, label: "浅色", value: "light" },
  { icon: MoonIcon, label: "深色", value: "dark" },
  { icon: MonitorIcon, label: "跟随系统", value: "system" },
] as const;

export function ThemeToggle({
  className,
  size = "icon-sm",
}: {
  className?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "icon-lg";
}) {
  const { theme, setTheme } = useTheme();
  const isHydrated = useHydrated();
  const activeTheme = isHydrated ? (theme ?? "system") : "system";

  return (
    // modal={false}：主题菜单是非模态的小菜单，不需要 Radix 默认的 body 锁滚和焦点陷阱。
    // 首页"打开菜单时滚动条往上跳"的真正根因是 GSAP ScrollSmoother 的 onFocusIn
    // 自动 scroll-into-view —— 已在 src/components/features/home/smooth-scroll.tsx 修掉。
    // modal={false}: small non-modal theme picker doesn't need Radix's scroll lock
    // or focus trap. The homepage "scrollbar jumps up on open" root cause was
    // GSAP ScrollSmoother's onFocusIn auto-scroll-into-view — fixed in
    // src/components/features/home/smooth-scroll.tsx.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="切换主题"
          className={className}
          size={size}
          type="button"
          variant="ghost"
        >
          <SunIcon className="size-4 dark:hidden" />
          <MoonIcon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup onValueChange={setTheme} value={activeTheme}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className="mr-2 size-4" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSubMenu() {
  const { theme, setTheme } = useTheme();
  const isHydrated = useHydrated();
  const activeTheme = isHydrated ? (theme ?? "system") : "system";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SunIcon className="mr-2 size-4 dark:hidden" />
        <MoonIcon className="mr-2 hidden size-4 dark:block" />
        主题
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        <DropdownMenuRadioGroup onValueChange={setTheme} value={activeTheme}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className="mr-2 size-4" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
