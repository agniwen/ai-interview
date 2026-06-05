"use client";

import { useEffect } from "react";
import { identifyAnalyticsUser, resetAnalyticsUser } from "@/lib/client/analytics";
import { authClient } from "@/lib/shared/auth-client";

export function WorkspaceAnalyticsIdentity({ workspaceId }: { workspaceId: string }) {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      resetAnalyticsUser();
      return;
    }

    identifyAnalyticsUser(userId, { workspaceId });
  }, [session?.user?.id, workspaceId]);

  return null;
}
