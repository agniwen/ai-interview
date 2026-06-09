import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "./platform-admin.server";
import type { PlatformAdminState } from "./platform-admin.server";

export const getPlatformAdminState = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformAdminState> => await getPlatformAdminStateFromRequest(),
);
