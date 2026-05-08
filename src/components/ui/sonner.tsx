"use client";

import type { ReactNode } from "react";
import { toast as heroToast } from "@heroui/react";

/**
 * Sonner-compatible shim around Hero UI v3 Toast.
 * Re-exports `toast` and a `Toaster` no-op so call sites importing from
 * `@/components/ui/sonner` keep working without rewrites. The actual
 * <ToastProvider /> is mounted in `src/app/layout.tsx`.
 */

type ToastOptions = {
  description?: ReactNode;
  duration?: number;
  /** Sonner extras we silently drop (Hero UI doesn't use them). */
  id?: string | number;
  position?: string;
  important?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cancel?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

function toHeroOpts(opts?: ToastOptions) {
  if (!opts) return undefined;
  const { description, duration } = opts;
  return { description, timeout: duration };
}

const callable = (message: ReactNode, opts?: ToastOptions) => heroToast(message, toHeroOpts(opts));

export const toast = Object.assign(callable, {
  success: (message: ReactNode, opts?: ToastOptions) =>
    heroToast.success(message, toHeroOpts(opts)),
  /** Sonner uses `error`; Hero UI uses `danger`. */
  error: (message: ReactNode, opts?: ToastOptions) => heroToast.danger(message, toHeroOpts(opts)),
  warning: (message: ReactNode, opts?: ToastOptions) =>
    heroToast.warning(message, toHeroOpts(opts)),
  info: (message: ReactNode, opts?: ToastOptions) => heroToast.info(message, toHeroOpts(opts)),
  loading: (message: ReactNode, opts?: ToastOptions) =>
    heroToast(message, { ...toHeroOpts(opts), isLoading: true }),
  dismiss: (key?: string) => {
    if (key) heroToast.close(key);
    else heroToast.clear();
  },
  promise: heroToast.promise,
});

/** No-op — Hero UI v3 mounts its own ToastProvider in layout.tsx. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Toaster(_props?: Record<string, any>) {
  return null;
}
