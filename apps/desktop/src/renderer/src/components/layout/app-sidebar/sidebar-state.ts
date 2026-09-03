import { atomWithStorage, createJSONStorage } from "jotai/utils";

const sidebarStorage = createJSONStorage<boolean>(() => globalThis.window?.localStorage);

export const desktopSidebarOpenAtom = atomWithStorage<boolean>(
  "arc:desktop-sidebar-open:v1",
  true,
  sidebarStorage,
  { getOnInit: true },
);
