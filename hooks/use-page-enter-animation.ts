'use client';

import type { RefObject } from 'react';
import { createContext, use, useLayoutEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useViewTransitionReady } from './use-view-transition-ready';

gsap.registerPlugin(useGSAP);

/**
 * Context to pass the sidebar ref from chat layout down to the chat page
 * so the page can coordinate the enter animation for both sidebar + composer.
 */
export const ChatLayoutAnimationContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useChatLayoutSidebarRef() {
  return use(ChatLayoutAnimationContext);
}

/**
 * Animates sidebar (slide from left) and composer (slide from bottom)
 * after the View Transition animation finishes.
 */
export function usePageEnterAnimation(
  sidebarRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
) {
  const ready = useViewTransitionReady();

  // Hide elements immediately on mount, before browser paints.
  useLayoutEffect(() => {
    if (sidebarRef.current) {
      gsap.set(sidebarRef.current, { x: -40, autoAlpha: 0 });
    }
    if (composerRef.current) {
      gsap.set(composerRef.current, { y: 30, autoAlpha: 0 });
    }
  }, [sidebarRef, composerRef]);

  // Animate in after the view transition finishes.
  useGSAP(() => {
    if (!ready) return;

    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        html.style.overflow = prevOverflow;
      },
    });

    if (sidebarRef.current) {
      tl.to(sidebarRef.current, { x: 0, autoAlpha: 1, duration: 0.5 }, 0);
    }

    if (composerRef.current) {
      tl.to(composerRef.current, { y: 0, autoAlpha: 1, duration: 0.5 }, 0.08);
    }
  }, { dependencies: [ready] });
}
