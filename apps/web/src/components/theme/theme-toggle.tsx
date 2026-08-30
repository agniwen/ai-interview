"use client";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useThemeTransition } from "./use-theme-transition";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import * as m from "@/paraglide/messages";

const THEME_OPTIONS = [
  { icon: IconSun, label: m.theme_light, value: "light" },
  { icon: IconMoon, label: m.theme_dark, value: "dark" },
  { icon: IconDeviceDesktop, label: m.theme_system, value: "system" },
] as const;

export function ThemeToggle({
  className,
  size = "icon-sm",
}: {
  className?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "icon-lg";
}) {
  const { theme, setTheme } = useThemeTransition();
  const isHydrated = useHydrated();
  const activeTheme = isHydrated ? (theme ?? "system") : "system";

  return (
    // Small non-modal theme picker: no body scroll lock or focus trap needed.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={m.theme_switcher_label()}
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
                {option.label()}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
