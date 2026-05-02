"use client";

import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect } from "react";

export function OverlayScrollbarsBody() {
  const [initialize] = useOverlayScrollbars({
    defer: true,
    options: {
      scrollbars: {
        autoHide: "leave",
        autoHideDelay: 600,
        theme: "os-theme-app",
      },
    },
  });

  useEffect(() => {
    initialize({
      cancel: { body: false },
      target: document.body,
    });
  }, [initialize]);

  return null;
}
