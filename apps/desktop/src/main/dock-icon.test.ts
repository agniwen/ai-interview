import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = join(import.meta.dirname, "../..");

describe("desktop app icon", () => {
  it("uses a padded Icon Composer render in development without overriding packaged icons", () => {
    const mainSource = readFileSync(join(import.meta.dirname, "index.ts"), "utf-8");
    const builderConfig = readFileSync(join(desktopRoot, "electron-builder.yml"), "utf-8");
    const dockIcon = readFileSync(join(desktopRoot, "resources/icon-mac.png"));
    const legacyMacIcon = readFileSync(join(desktopRoot, "build/icon-mac.png"));
    const composerExport = readFileSync(join(desktopRoot, "build/icon-composer-dock.png"));

    expect(mainSource).toMatch(
      /if \(process\.platform === "darwin" && !app\.isPackaged\) \{\s*app\.dock\?\.setIcon\(macIcon\);\s*\}/,
    );
    expect(builderConfig).toMatch(/mac:\s+icon: meeting-buddy\.icon/);
    expect(builderConfig).toMatch(/win:\s+executableName: arc-desktop\s+icon: icon\.png/);
    expect(dockIcon.equals(legacyMacIcon)).toBe(true);
    expect(dockIcon.equals(composerExport)).toBe(false);
    expect(dockIcon.readUInt32BE(16)).toBe(1024);
    expect(dockIcon.readUInt32BE(20)).toBe(1024);
  });
});
