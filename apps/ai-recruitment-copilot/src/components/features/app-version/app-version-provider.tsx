"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  fetchLatestBuildTime,
  isStaleClient,
} from "@/lib/client/app-version";
import { BUILD_TIME } from "@/lib/client/build-info";
import { env } from "@/env/client";

interface AppVersionContextValue {
  latestBuildTime: string | null;
}

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

export function useAppVersion() {
  return useContext(AppVersionContext);
}

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [latestBuildTime, setLatestBuildTime] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const forceUpdateNotice = import.meta.env.DEV && env.NEXT_PUBLIC_FORCE_APP_UPDATE_NOTICE;

  const checkVersion = useCallback(async () => {
    if (!navigator.onLine || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    try {
      const currentBuildTime = await fetchLatestBuildTime();
      if (!(forceUpdateNotice || isStaleClient(currentBuildTime, BUILD_TIME))) {
        setLatestBuildTime(null);
        return;
      }

      setLatestBuildTime(currentBuildTime);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug("[app-version] version check failed", error);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [forceUpdateNotice]);

  useEffect(() => {
    if (!(import.meta.env.PROD || forceUpdateNotice)) {
      return;
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };
    const checkWhenOnline = () => void checkVersion();

    void checkVersion();
    const interval = window.setInterval(checkWhenVisible, APP_VERSION_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("online", checkWhenOnline);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("online", checkWhenOnline);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkVersion, forceUpdateNotice]);

  return <AppVersionContext value={{ latestBuildTime }}>{children}</AppVersionContext>;
}
