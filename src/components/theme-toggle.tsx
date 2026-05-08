"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { buttonClass } from "@/components/ui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";

const THEME_OPTIONS = [
  { icon: SunIcon, label: "浅色", value: "light" },
  { icon: MoonIcon, label: "深色", value: "dark" },
  { icon: MonitorIcon, label: "跟随系统", value: "system" },
] as const;

function resolveSize(size: "icon-xs" | "icon-sm" | "icon" | "icon-lg"): "sm" | "md" | "lg" {
  if (size === "icon-xs" || size === "icon-sm") {
    return "sm";
  }
  if (size === "icon-lg") {
    return "lg";
  }
  return "md";
}

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
    <Dropdown>
      <DropdownTrigger
        aria-label="切换主题"
        className={buttonClass({
          className,
          isIconOnly: true,
          size: resolveSize(size),
          variant: "ghost",
        })}
      >
        <SunIcon className="size-4 dark:hidden" />
        <MoonIcon className="hidden size-4 dark:block" />
      </DropdownTrigger>
      <DropdownPopover placement="bottom end">
        <DropdownMenu className="w-40">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownItem
                key={option.value}
                className={activeTheme === option.value ? "font-medium" : undefined}
                onAction={() => setTheme(option.value)}
              >
                <Icon className="mr-2 size-4" />
                {option.label}
              </DropdownItem>
            );
          })}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}

/**
 * A flat section of theme items to embed inside a parent DropdownMenu.
 * Previously a sub-menu; now rendered as a DropdownSection since Hero UI
 * sub-menu composition is handled at the Dropdown root level.
 */
export function ThemeSubMenu() {
  const { theme, setTheme } = useTheme();
  const isHydrated = useHydrated();
  const activeTheme = isHydrated ? (theme ?? "system") : "system";

  return (
    <DropdownSection>
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <DropdownItem
            key={option.value}
            className={activeTheme === option.value ? "font-medium" : undefined}
            onAction={() => setTheme(option.value)}
          >
            <Icon className="mr-2 size-4" />
            {option.label}
          </DropdownItem>
        );
      })}
    </DropdownSection>
  );
}
