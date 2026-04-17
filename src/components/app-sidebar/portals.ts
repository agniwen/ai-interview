import { createMagicPortal } from "foxact/magic-portal";

const [HeaderPortalProvider, HeaderPortalTarget, HeaderPortalContent] =
  createMagicPortal("app-sidebar-header");

const [BodyPortalProvider, BodyPortalTarget, BodyPortalContent] =
  createMagicPortal("app-sidebar-body");

const [FooterPortalProvider, FooterPortalTarget, FooterPortalContent] =
  createMagicPortal("app-sidebar-footer");

export const SidebarHeaderPortalProvider = HeaderPortalProvider;
export const SidebarHeaderPortalTarget = HeaderPortalTarget;
export const SidebarHeaderPortalContent = HeaderPortalContent;

export const SidebarBodyPortalProvider = BodyPortalProvider;
export const SidebarBodyPortalTarget = BodyPortalTarget;
export const SidebarBodyPortalContent = BodyPortalContent;

export const SidebarFooterPortalProvider = FooterPortalProvider;
export const SidebarFooterPortalTarget = FooterPortalTarget;
export const SidebarFooterPortalContent = FooterPortalContent;
