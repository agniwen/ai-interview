import { createContext, useContext } from "react";

import type { StudioConfig } from "../types";

export type StudioConfigContextType = StudioConfig & { isLoading: boolean };

export const StudioConfigContext = createContext<StudioConfigContextType>({
  apiPrefix: undefined,
  baseUrl: "",
  headers: {},
  isLoading: false,
});

export const useStudioConfig = () => useContext(StudioConfigContext);
