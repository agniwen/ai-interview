import { app, nativeTheme } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DesktopSettings, ThemeMode } from "../preload/orpc-contract";

const DEFAULTS: DesktopSettings = {
  apiBase: "http://localhost:3000",
  launchAtLogin: false,
  notifyOnFinish: false,
  theme: "system",
};

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function writeSettings(settings: DesktopSettings): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

/** Apply native-side effects that depend on settings values. */
function applySettings(settings: DesktopSettings): void {
  nativeTheme.themeSource = settings.theme;
  if (process.platform !== "linux") {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  }
}

export function readSettings(): DesktopSettings {
  try {
    const raw = readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Merge a patch, persist, apply native effects, and return the snapshot. */
export function updateSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const settings = { ...readSettings(), ...patch };
  writeSettings(settings);
  applySettings(settings);
  return settings;
}

/** Apply native effects (theme, login item) once at startup. */
export function applySettingsAtStartup(): void {
  applySettings(readSettings());
}

export type { DesktopSettings, ThemeMode };
