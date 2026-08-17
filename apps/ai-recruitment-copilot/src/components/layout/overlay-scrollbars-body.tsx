"use client";

import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect } from "react";

interface OverlayScrollbarsBodyDependencies {
  getInstance: () => { destroy: () => void } | undefined;
  initialize: (target: { cancel: { body: boolean }; target: HTMLElement }) => void;
}

export function OverlayScrollbarsBody({
  dependencies,
}: {
  dependencies?: OverlayScrollbarsBodyDependencies;
}) {
  const scrollbars = useOverlayScrollbars({
    defer: true,
    options: {
      scrollbars: {
        autoHide: "leave",
        autoHideDelay: 600,
        theme: "os-theme-app",
      },
    },
  });
  const [initialize, getInstance] = dependencies
    ? [dependencies.initialize, dependencies.getInstance]
    : scrollbars;

  useEffect(() => {
    initialize({
      cancel: { body: false },
      target: document.body,
    });
    return () => {
      getInstance()?.destroy();
    };
  }, [getInstance, initialize]);

  return null;
}
