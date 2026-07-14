import { createContext, useContext } from "react";

interface ModelResetContextType {
  registerResetFn: (fn: (() => void) | null) => void;
  triggerReset: () => void;
}

const ModelResetContext = createContext<ModelResetContextType | null>(null);

export function useModelReset() {
  const context = useContext(ModelResetContext);
  // Return a no-op implementation if context is not available
  if (!context) {
    return {
      registerResetFn: () => {
        /* empty */
      },
      triggerReset: () => {
        /* empty */
      },
    };
  }
  return context;
}
