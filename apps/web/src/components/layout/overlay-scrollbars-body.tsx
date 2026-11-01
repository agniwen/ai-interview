"use client";

import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect } from "react";
import { markBodyScrollbarsReady } from "@/lib/client/body-scrollbars";
import { runningEntranceAnimations } from "@/lib/client/entrance-animations";

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
    events: { initialized: markBodyScrollbarsReady },
    options: {
      scrollbars: {
        autoHide: "scroll",
        autoHideDelay: 600,
        theme: "os-theme-app",
      },
    },
  });
  const [initialize, getInstance] = dependencies
    ? [dependencies.initialize, dependencies.getInstance]
    : scrollbars;

  useEffect(() => {
    let active = true;
    const initializeBody = () => {
      if (active) {
        initialize({
          cancel: { body: false },
          target: document.body,
        });
      }
    };

    // 初始化会把 body 子节点重新插入，打断仍在播放的入场动画，因此等它们播完再接管滚动条。
    // Initialization re-inserts body's children, cutting short running entrance
    // animations, so wait for them before taking over the scrollbar.
    const entrances = runningEntranceAnimations();
    async function initializeAfterEntrances() {
      await Promise.allSettled(entrances.map((animation) => animation.finished));
      initializeBody();
    }

    if (entrances.length > 0) {
      void initializeAfterEntrances();
    } else {
      initializeBody();
    }

    return () => {
      active = false;
      getInstance()?.destroy();
    };
  }, [getInstance, initialize]);

  return null;
}
