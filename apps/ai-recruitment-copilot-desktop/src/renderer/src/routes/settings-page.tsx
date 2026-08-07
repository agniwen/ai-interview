import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SettingsSidebarSlots } from "@/components/features/settings/settings-sidebar-slots";
import type { AppIconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-ui";
import type { ThemeMode } from "@/lib/settings";
import { updateSettings, useSettings } from "@/lib/settings";

const THEME_OPTIONS: { icon: AppIconName; label: string; value: ThemeMode }[] = [
  { icon: "ph:sun", label: "浅色", value: "light" },
  { icon: "ph:moon", label: "深色", value: "dark" },
  { icon: "ph:monitor", label: "跟随系统", value: "system" },
];

/** Theme dropdown; selection flows through next-themes (class + localStorage). */
function ThemeSelect(): React.JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <Select
      aria-label="主题"
      onValueChange={(value) => {
        if (typeof value === "string") {
          setTheme(value as ThemeMode);
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

/** Text field that saves ~800ms after typing stops and flushes on blur. */
function ApiBaseField(): React.JSX.Element {
  const settings = useSettings();
  const [value, setValue] = useState(settings.apiBase);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setValue(settings.apiBase);
  }, [settings.apiBase]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const scheduleSave = (next: string): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void updateSettings({ apiBase: next });
    }, 800);
  };

  return (
    <Input
      autoComplete="off"
      id="api-base"
      onChange={(event) => {
        setValue(event.target.value);
        scheduleSave(event.target.value);
      }}
      onBlur={() => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void updateSettings({ apiBase: value });
      }}
      placeholder="https://example.com"
      spellCheck={false}
      value={value}
    />
  );
}

export function SettingsPage(): React.JSX.Element {
  const settings = useSettings();
  const section = useRouterState({
    select: (state) => {
      const search = state.location.search as { section?: string };
      return search.section ?? "appearance";
    },
  });

  useEffect(() => {
    const el = document.querySelector(`#${section}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [section]);

  return (
    <>
      <SettingsSidebarSlots />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6 pb-16">
        <div className="space-y-0.5">
          <h1 className="text-xl font-medium tracking-tight text-foreground">设置</h1>
          <p className="text-sm text-muted-foreground">外观与运行偏好，修改后自动保存。</p>
        </div>

        <SettingsSection
          description="选择桌面端的外观主题，立即生效。"
          id="appearance"
          title="外观"
        >
          <SettingsGroup>
            <SettingsRow
              description="浅色、深色或跟随系统，修改后自动保存。"
              htmlFor="theme"
              label="主题"
            >
              <ThemeSelect />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection description="应用运行相关的通用偏好。" id="general" title="通用">
          <SettingsGroup>
            <SettingsRow
              description="开发期指向本地 web/backend；生产环境可改为部署地址。"
              htmlFor="api-base"
              label="API 基址"
            >
              <ApiBaseField />
            </SettingsRow>

            <SettingsRow
              description="登录系统时自动启动应用。"
              htmlFor="launch-at-login"
              label="开机启动"
            >
              <div className="flex justify-end">
                <Switch
                  checked={settings.launchAtLogin}
                  id="launch-at-login"
                  onCheckedChange={(checked) => {
                    void updateSettings({ launchAtLogin: checked });
                  }}
                />
              </div>
            </SettingsRow>

            <SettingsRow
              description="录制完成后发送系统通知。"
              htmlFor="notify-on-finish"
              label="录制结束系统通知"
            >
              <div className="flex justify-end">
                <Switch
                  checked={settings.notifyOnFinish}
                  id="notify-on-finish"
                  onCheckedChange={(checked) => {
                    void updateSettings({ notifyOnFinish: checked });
                  }}
                />
              </div>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      </div>
    </>
  );
}
