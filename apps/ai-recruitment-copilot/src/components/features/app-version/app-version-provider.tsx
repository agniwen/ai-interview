"use client";

import type { ReactNode } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  APP_VERSION_CHECK_INTERVAL_MS,
  fetchLatestBuildTime,
  isStaleClient,
} from "@/lib/client/app-version";
import { BUILD_TIME } from "@/lib/client/build-info";
import { env } from "@/env/client";

interface AppVersionContextValue {
  latestBuildTime: string | null;
  requestRefresh: () => void;
}

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

export function useAppVersion() {
  return useContext(AppVersionContext);
}

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [latestBuildTime, setLatestBuildTime] = useState<string | null>(null);
  const [updateNoticeVisible, setUpdateNoticeVisible] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const inFlightRef = useRef(false);
  const lastPromptedBuildTimeRef = useRef<string | null>(null);
  const forceUpdateNotice = import.meta.env.DEV && env.NEXT_PUBLIC_FORCE_APP_UPDATE_NOTICE;

  const requestRefresh = useCallback(() => setRefreshConfirmOpen(true), []);

  const checkVersion = useCallback(async () => {
    if (!navigator.onLine || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    try {
      const currentBuildTime = await fetchLatestBuildTime();
      if (!(forceUpdateNotice || isStaleClient(currentBuildTime, BUILD_TIME))) {
        return;
      }

      setLatestBuildTime(currentBuildTime);
      if (lastPromptedBuildTimeRef.current === currentBuildTime) {
        return;
      }

      lastPromptedBuildTimeRef.current = currentBuildTime;
      setUpdateNoticeVisible(true);
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

  return (
    <AppVersionContext value={{ latestBuildTime, requestRefresh }}>
      {children}
      {updateNoticeVisible ? (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <Alert className="pointer-events-auto w-full max-w-xl shadow-lg sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <IconRefresh aria-hidden="true" />
            <div className="col-start-2 min-w-0">
              <AlertTitle>新版本已发布</AlertTitle>
              <AlertDescription>刷新后即可使用最新功能</AlertDescription>
            </div>
            <div className="col-start-2 row-start-2 mt-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-self-end">
              <Button onClick={requestRefresh} size="sm">
                立即刷新
              </Button>
              <Button onClick={() => setUpdateNoticeVisible(false)} size="sm" variant="ghost">
                稍后
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}
      <AlertDialog onOpenChange={setRefreshConfirmOpen} open={refreshConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刷新以更新应用？</AlertDialogTitle>
            <AlertDialogDescription>页面将重新加载，未保存的修改可能丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.reload()}>确认刷新</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppVersionContext>
  );
}
