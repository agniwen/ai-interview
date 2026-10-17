"use client";

import * as React from "react";

/**
 * 桌面端弹窗的呈现位置："center" 为居中弹窗，"side" 为从右侧滑入的抽屉。
 * 移动端始终使用底部抽屉，不受此设置影响。
 * / Desktop placement for Modal and Dialog surfaces; mobile always uses the bottom drawer.
 */
export type ModalPlacement = "center" | "side";

const ModalPlacementContext = React.createContext<ModalPlacement>("center");

export function ModalPlacementProvider({
  children,
  placement,
}: {
  children: React.ReactNode;
  placement: ModalPlacement;
}) {
  return (
    <ModalPlacementContext.Provider value={placement}>{children}</ModalPlacementContext.Provider>
  );
}

export function useModalPlacement(override?: ModalPlacement): ModalPlacement {
  const placement = React.useContext(ModalPlacementContext);
  return override ?? placement;
}

/** 右侧抽屉的定位与滑入动画，Modal 与 DialogContent 共用。 */
export const sideModalPositionClass =
  "fixed inset-y-0 right-0 z-50 h-dvh w-full max-w-[calc(100%-2rem)] outline-none";

export const sideModalMotionClass =
  "transition-transform duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:translate-x-full data-ending-style:translate-x-full data-ending-style:duration-[var(--duration-medium)] motion-reduce:transition-none";
