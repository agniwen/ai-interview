"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { capturePageViewed } from "@/lib/client/analytics";

export function WorkspacePageViewTracker({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    capturePageViewed(pathname, { workspaceId });
  }, [pathname, workspaceId]);

  return null;
}
