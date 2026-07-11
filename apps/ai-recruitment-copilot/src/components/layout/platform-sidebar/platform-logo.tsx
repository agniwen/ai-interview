"use client";

import { IconShield } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { useSidebar } from "@/components/ui/sidebar";

export function PlatformLogo() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Link className="flex items-center gap-2 px-2 py-1" to="/platform">
      <IconShield className="size-6 shrink-0 text-primary" />
      {!isCollapsed && <span className="truncate font-semibold text-lg">Platform</span>}
    </Link>
  );
}
