"use client";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";

const THEME_OPTIONS = [
  { icon: IconSun, label: "浅色", value: "light" },
  { icon: IconMoon, label: "深色", value: "dark" },
  { icon: IconDeviceDesktop, label: "跟随系统", value: "system" },
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
    // Small non-modal theme picker: no body scroll lock or focus trap needed.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="切换主题"
            className={className}
            size={size}
            type="button"
            variant="ghost"
          >
            <IconSun className="size-4 dark:hidden" />
            <IconMoon className="hidden size-4 dark:block" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup onValueChange={setTheme} value={activeTheme}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className=" size-4" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
