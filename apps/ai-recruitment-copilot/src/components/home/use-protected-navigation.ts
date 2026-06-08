// 用途：登录态门控的导航 hook，未登录时打开登录弹窗
// Purpose: auth-gated navigation hook; opens sign-in dialog when unauthenticated.
"use client";

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/client/auth-client";

export function useProtectedNavigation() {
  const navigateRoute = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const navigate = (href: string) => {
    if (isPending) {
      return;
    }
    if (session?.user) {
      void navigateRoute({ href });
      return;
    }
    setPendingPath(href);
  };

  return {
    isPending,
    navigate,
    pendingPath,
    setPendingPath,
  };
}
