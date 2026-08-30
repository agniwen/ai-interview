import { useTheme } from "next-themes";
import type { AppIconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { Switch } from "@/components/ui/switch";
import { updateSettings, useSettings } from "@/lib/settings";
import type { ThemeMode } from "@/lib/settings";
import { themeModeSchema } from "../../../../../preload/orpc-contract";

const THEME_OPTIONS: { icon: AppIconName; label: string; value: ThemeMode }[] = [
  { icon: "ph:sun", label: "浅色", value: "light" },
  { icon: "ph:moon", label: "深色", value: "dark" },
  { icon: "ph:monitor", label: "跟随系统", value: "system" },
];

function ThemeSelect(): React.JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <Select
      aria-label="主题"
      onValueChange={(value) => {
        const parsedTheme = themeModeSchema.safeParse(value);
        if (parsedTheme.success) {
          setTheme(parsedTheme.data);
        }
      }}
      value={theme}
    >
      <SelectTrigger className="w-full" id="theme">
        <SelectValue>
          {(value) => {
            const option = THEME_OPTIONS.find((item) => item.value === value) ?? THEME_OPTIONS[2];
            return (
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Icon className="size-4 shrink-0" icon={option.icon} />
                {option.label}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} label={option.label} value={option.value}>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Icon className="size-4 shrink-0" icon={option.icon} />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppearanceSettingsPage(): React.JSX.Element {
  const settings = useSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6 pb-16">
      <div className="space-y-0.5">
        <h1 className="text-xl font-medium tracking-tight text-foreground">外观</h1>
        <p className="text-sm text-muted-foreground">选择 Meeting Buddy 的显示主题。</p>
      </div>

      <SettingsGroup>
        <SettingsRow
          description="浅色、深色或跟随系统，修改后自动保存。"
          htmlFor="theme"
          label="主题"
        >
          <ThemeSelect />
        </SettingsRow>
        <SettingsRow
          description="关闭后使用固定不透明背景，不再显示高斯模糊效果。"
          htmlFor="transparent-background"
          label="透明背景"
        >
          <div className="flex justify-end">
            <Switch
              checked={settings.transparentBackground}
              id="transparent-background"
              onCheckedChange={(checked) => {
                void updateSettings({ transparentBackground: checked });
              }}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
