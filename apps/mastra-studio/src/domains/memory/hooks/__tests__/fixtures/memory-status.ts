import type { GetMemoryStatusResponse } from "@mastra/client-js";

export const omEnabledStatus: GetMemoryStatusResponse = {
  memoryType: "local",
  observationalMemory: {
    enabled: true,
    hasRecord: true,
    isObserving: false,
    isReflecting: false,
  },
  result: true,
};
