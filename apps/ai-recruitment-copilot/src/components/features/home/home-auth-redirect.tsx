"use client";

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { getActiveOrganizationState } from "@/lib/start/auth-session";
import { resolveHomeRedirect } from "./home-navigation";
import type { HomeGotoTarget } from "./home-navigation";

interface HomeAuthRedirectProps {
  goto: HomeGotoTarget | undefined;
}

export function HomeAuthRedirect({ goto }: HomeAuthRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function redirectAuthenticatedUser() {
      try {
        const state = await getActiveOrganizationState();
        const href = resolveHomeRedirect(state, goto);
        if (active && href) {
          await router.navigate({ href, replace: true });
        }
      } catch (error) {
        console.error("[home] failed to resolve authenticated destination", error);
      }
    }

    void redirectAuthenticatedUser();

    return () => {
      active = false;
    };
  }, [goto, router]);

  return null;
}
