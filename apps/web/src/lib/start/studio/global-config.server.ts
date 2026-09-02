import type { GlobalConfigRecord } from "@app/shared/global-config";
import { getGlobalConfig } from "@app/server/web/studio";

export function loadStudioGlobalConfigInitial(workspaceId: string): Promise<GlobalConfigRecord> {
  return getGlobalConfig(workspaceId);
}
