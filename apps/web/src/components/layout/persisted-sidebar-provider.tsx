"use client";

import type { ComponentProps } from "react";
import { useSidebarPersistence } from "@/components/layout/sidebar-persistence-context";
import { SidebarProvider } from "@/components/ui/sidebar";

export function PersistedSidebarProvider(props: ComponentProps<typeof SidebarProvider>) {
  const { open, setOpen } = useSidebarPersistence();

  return <SidebarProvider {...props} onOpenChange={setOpen} open={open} />;
}
