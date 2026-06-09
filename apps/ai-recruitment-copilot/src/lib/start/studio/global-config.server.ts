import type { GlobalConfigRecord } from "@arc/shared/global-config";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";

export function loadStudioGlobalConfigInitial(workspaceId: string): Promise<GlobalConfigRecord> {
  return getGlobalConfig(workspaceId);
}
