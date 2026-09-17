import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
  parseSidebarInitialState,
  SIDEBAR_MENU_OPEN_COOKIE_NAME,
  SIDEBAR_OPEN_COOKIE_NAME,
} from "@/lib/sidebar-persistence";

export const getSidebarInitialState = createServerFn({ method: "GET" }).handler(() =>
  parseSidebarInitialState(
    getCookie(SIDEBAR_OPEN_COOKIE_NAME),
    getCookie(SIDEBAR_MENU_OPEN_COOKIE_NAME),
  ),
);
