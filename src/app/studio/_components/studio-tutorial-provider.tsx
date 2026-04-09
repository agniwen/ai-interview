'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useStudioTutorial } from '@/app/studio/_hooks/use-studio-tutorial';

const StudioTutorialContext = createContext<{ startTutorial: () => void }>({
  startTutorial: () => {},
});

export function StudioTutorialProvider({ children }: { children: ReactNode }) {
  const { startTutorial } = useStudioTutorial();

  return (
    <StudioTutorialContext.Provider value={{ startTutorial }}>
      {children}
    </StudioTutorialContext.Provider>
  );
}

export function useStudioTutorialContext() {
  return useContext(StudioTutorialContext);
}
