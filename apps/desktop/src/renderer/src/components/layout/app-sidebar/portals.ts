/**
 * Magic Portal for sidebar slots — same pattern as foxact `createMagicPortal`
 * and the web app's studio sidebar (`apps/web/.../portals.ts`).
 *
 * Layout owns `<PortalTarget />` (where content lands). Pages/features own
 * `<PortalContent />` (what to render). Provider must wrap both.
 *
 * @see https://foxact.skk.moe/magic-portal/
 */
import { createContext, createElement, useContext, useState } from "react";
import type { HTMLAttributes, PropsWithChildren } from "react";
import { createPortal } from "react-dom";

const ignorePortalTarget = (_target: HTMLElement | null): void => undefined;

function createSidebarPortal(name: string) {
  const PortalTargetContext = createContext<HTMLElement | null>(null);
  const SetPortalTargetContext = createContext(ignorePortalTarget);

  function PortalProvider({ children }: PropsWithChildren) {
    const [target, setTarget] = useState<HTMLElement | null>(null);

    return createElement(
      PortalTargetContext.Provider,
      { value: target },
      createElement(SetPortalTargetContext.Provider, { value: setTarget }, children),
    );
  }

  function PortalTarget(props: HTMLAttributes<HTMLDivElement>) {
    const setTarget = useContext(SetPortalTargetContext);

    return createElement("div", {
      "data-sidebar-portal-target": name,
      ...props,
      ref: setTarget,
    });
  }

  function PortalContent({ children }: PropsWithChildren) {
    const target = useContext(PortalTargetContext);
    return target ? createPortal(children, target) : null;
  }

  PortalProvider.displayName = `${name}.PortalProvider`;
  PortalTarget.displayName = `${name}.PortalTarget`;
  PortalContent.displayName = `${name}.PortalContent`;

  return [PortalProvider, PortalTarget, PortalContent] as const;
}

const [HeaderPortalProvider, HeaderPortalTarget, HeaderPortalContent] =
  createSidebarPortal("desktop-sidebar-header");

const [BodyPortalProvider, BodyPortalTarget, BodyPortalContent] =
  createSidebarPortal("desktop-sidebar-body");

const [FooterPortalProvider, FooterPortalTarget, FooterPortalContent] =
  createSidebarPortal("desktop-sidebar-footer");

export const SidebarHeaderPortalProvider = HeaderPortalProvider;
export const SidebarHeaderPortalTarget = HeaderPortalTarget;
export const SidebarHeaderPortalContent = HeaderPortalContent;

export const SidebarBodyPortalProvider = BodyPortalProvider;
export const SidebarBodyPortalTarget = BodyPortalTarget;
export const SidebarBodyPortalContent = BodyPortalContent;

export const SidebarFooterPortalProvider = FooterPortalProvider;
export const SidebarFooterPortalTarget = FooterPortalTarget;
export const SidebarFooterPortalContent = FooterPortalContent;
