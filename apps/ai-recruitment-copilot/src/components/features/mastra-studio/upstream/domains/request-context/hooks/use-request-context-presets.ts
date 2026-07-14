import { useMemo } from "react";

export type RequestContextPresets = Record<string, Record<string, unknown>>;

interface MastraRequestContextWindow extends Window {
  MASTRA_REQUEST_CONTEXT_PRESETS?: string;
}

export function useRequestContextPresets(): RequestContextPresets | null {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const presetsStr = (window as MastraRequestContextWindow).MASTRA_REQUEST_CONTEXT_PRESETS;

    if (!presetsStr || presetsStr === "%%MASTRA_REQUEST_CONTEXT_PRESETS%%") {
      return null;
    }

    try {
      const parsed = JSON.parse(presetsStr);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as RequestContextPresets;
      }
    } catch {
      console.warn("Failed to parse request context presets");
    }

    return null;
  }, []);
}
