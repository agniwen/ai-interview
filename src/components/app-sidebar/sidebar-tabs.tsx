"use client";

import { atom, useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SidebarTabValue = "chat" | "studio";

const TAB_ROUTES: Record<SidebarTabValue, string> = {
  chat: "/chat",
  studio: "/studio/interviews",
};

const tabLastPathAtom = atom<Record<SidebarTabValue, string | null>>({
  chat: null,
  studio: null,
});

function resolveActiveTab(pathname: string): SidebarTabValue | null {
  if (pathname.startsWith("/studio")) {
    return "studio";
  }

  if (pathname.startsWith("/chat")) {
    return "chat";
  }

  return null;
}

export function SidebarTabs({ canAccessAdmin }: { canAccessAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = useMemo(() => resolveActiveTab(pathname), [pathname]);
  const [tabLastPath, setTabLastPath] = useAtom(tabLastPathAtom);

  // Keep the active tab's last-visited path in sync so that tab switching
  // can restore it on return.
  useEffect(() => {
    if (!activeTab) {
      return;
    }

    setTabLastPath((prev) =>
      prev[activeTab] === pathname ? prev : { ...prev, [activeTab]: pathname },
    );
  }, [activeTab, pathname, setTabLastPath]);

  if (!canAccessAdmin) {
    return null;
  }

  const handleChange = (value: string) => {
    const nextTab = value as SidebarTabValue;
    const target = tabLastPath[nextTab] ?? TAB_ROUTES[nextTab];

    if (target && target !== pathname) {
      router.push(target);
    }
  };

  return (
    <Tabs
      className="w-full group-data-[collapsible=icon]:hidden"
      onValueChange={handleChange}
      value={activeTab ?? "chat"}
    >
      <TabsList className="w-full">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="studio">Studio</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
