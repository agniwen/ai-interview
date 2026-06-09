import { createServerFn } from "@tanstack/react-start";
import type { PlatformAdminState } from "./platform-admin.server";

export const getPlatformAdminState = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformAdminState> => {
    const platformAdmin = await import("./platform-admin.server");
    return await platformAdmin.getPlatformAdminStateFromRequest();
  },
);
