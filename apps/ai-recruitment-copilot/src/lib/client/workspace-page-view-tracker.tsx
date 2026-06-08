"use client";

import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { capturePageViewed } from "@/lib/client/analytics";

export function WorkspacePageViewTracker({ workspaceId }: { workspaceId: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    capturePageViewed(pathname, { workspaceId });
  }, [pathname, workspaceId]);

  return null;
}
