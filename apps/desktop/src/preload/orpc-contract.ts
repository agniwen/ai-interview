import { oc } from "@orpc/contract";
import { z } from "zod";

/**
 * Cross-process oRPC contract for desktop settings.
 *
 * Lives in `src/preload/` as the shared contract surface: the main process
 * implements it (`src/main/orpc.ts`) and the renderer types its client
 * against it (`src/renderer/src/lib/orpc.ts`). Type-only + zod — no electron
 * or node imports, so both tsconfigs can consume it.
 */
export const themeModeSchema = z.enum(["light", "dark", "system"]);

export const desktopSettingsSchema = z.object({
  notifyOnFinish: z.boolean(),
  theme: themeModeSchema,
  transparentBackground: z.boolean(),
});

export const orpcContract = oc.router({
  settings: {
    get: oc.output(desktopSettingsSchema),
    set: oc.input(desktopSettingsSchema.partial()).output(desktopSettingsSchema),
  },
});

export type DesktopSettings = z.infer<typeof desktopSettingsSchema>;
export type ThemeMode = z.infer<typeof themeModeSchema>;
