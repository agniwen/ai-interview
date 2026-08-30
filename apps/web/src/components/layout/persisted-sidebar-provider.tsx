"use client";

import type { ComponentProps } from "react";
import { useAtom } from "jotai";
import { SidebarProvider } from "@/components/ui/sidebar";
import { sidebarOpenAtom } from "@/lib/client/atoms/sidebar-open";

export function PersistedSidebarProvider(props: ComponentProps<typeof SidebarProvider>) {
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);

  return <SidebarProvider {...props} onOpenChange={setSidebarOpen} open={sidebarOpen} />;
}
