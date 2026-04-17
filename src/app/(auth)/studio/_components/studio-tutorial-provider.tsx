"use client";

import type { ReactNode } from "react";
import { createContext, use } from "react";
import { useStudioTutorial } from "@/app/(auth)/studio/_hooks/use-studio-tutorial";

const noopStartTutorial = () => {
  // default impl; real provider overrides this
};

const StudioTutorialContext = createContext<{ startTutorial: () => void }>({
  startTutorial: noopStartTutorial,
});

export function StudioTutorialProvider({ children }: { children: ReactNode }) {
  const { startTutorial } = useStudioTutorial();

  return <StudioTutorialContext value={{ startTutorial }}>{children}</StudioTutorialContext>;
}

export function useStudioTutorialContext() {
  return use(StudioTutorialContext);
}
