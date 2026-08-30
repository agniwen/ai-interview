import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import type { AppIconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThemeMode } from "@/lib/settings";
import { cn } from "@arc/shared/utils";
import { themeModeSchema } from "../../../../preload/orpc-contract";

const THEME_OPTIONS: { icon: AppIconName; label: string; value: ThemeMode }[] = [
  { icon: "ph:sun", label: "浅色", value: "light" },
  { icon: "ph:moon", label: "深色", value: "dark" },
  { icon: "ph:monitor", label: "跟随系统", value: "system" },
];

interface ElectronNoDragStyle extends CSSProperties {
  WebkitAppRegion: "no-drag";
  appRegion: "no-drag";
}

const noDragStyle: ElectronNoDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
};

/**
 * Icon-only theme dropdown for chrome bars.
 * Trigger icon reflects the *selected* theme mode (light / dark / system),
 * not only the resolved color scheme.
 */
export function ThemeToggle({ className }: { className?: string }): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = themeModeSchema.safeParse(mounted ? theme : "system").data ?? "system";
  const current = THEME_OPTIONS.find((option) => option.value === activeTheme) ?? THEME_OPTIONS[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="切换主题"
        className={cn(
          "app-no-drag flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-80 transition-opacity hover:opacity-100",
          className,
        )}
        style={noDragStyle}
        type="button"
      >
        <Icon className="size-4" icon={current.icon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" sideOffset={6}>
        <DropdownMenuRadioGroup onValueChange={setTheme} value={activeTheme}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <Icon className="size-4" icon={option.icon} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
