import { useEffect, useLayoutEffect, useState } from "react";

import { useMastraInstanceStatus } from "../hooks/use-mastra-instance-status";
import type { StudioConfig } from "../types";
import { StudioConfigContext } from "./studio-config-state";

export interface StudioConfigProviderProps {
  children: React.ReactNode;
  endpoint?: string;
  defaultApiPrefix?: string;
}

const AUTH_HEADER_PARAM = "auth_header";
const AUTH_HEADER_NAME = "Authorization";

const readUrlAuthHeader = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const authHeader = new URL(window.location.href).searchParams.get(AUTH_HEADER_PARAM);
  return authHeader ? { [AUTH_HEADER_NAME]: authHeader } : {};
};

const removeUrlAuthHeader = () => {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has(AUTH_HEADER_PARAM)) {
    return;
  }

  url.searchParams.delete(AUTH_HEADER_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

export const StudioConfigProvider = ({
  children,
  endpoint = "http://localhost:4111",
  defaultApiPrefix = "/api",
}: StudioConfigProviderProps) => {
  const [urlHeaders] = useState<Record<string, string>>(readUrlAuthHeader);
  const {
    data: instanceStatus,
    isLoading: isStatusLoading,
    error,
  } = useMastraInstanceStatus(endpoint, urlHeaders);
  const [config, setConfig] = useState<StudioConfig & { isLoading: boolean }>({
    apiPrefix: undefined,
    baseUrl: "",
    headers: urlHeaders,
    isLoading: true,
  });

  useEffect(() => {
    removeUrlAuthHeader();
  }, []);

  useLayoutEffect(() => {
    // Handle error case - stop loading but don't configure
    if (error && !isStatusLoading) {
      return setConfig({
        apiPrefix: undefined,
        baseUrl: "",
        headers: urlHeaders,
        isLoading: false,
      });
    }

    // Don't run the effect during the fetch request
    if (!instanceStatus?.status) {
      return;
    }

    if (instanceStatus.status === "active") {
      const nextConfig = { apiPrefix: defaultApiPrefix, baseUrl: endpoint, headers: urlHeaders };
      return setConfig({ ...nextConfig, isLoading: false });
    }

    return setConfig({ apiPrefix: undefined, baseUrl: "", headers: urlHeaders, isLoading: false });
  }, [instanceStatus, endpoint, defaultApiPrefix, isStatusLoading, error, urlHeaders]);

  return <StudioConfigContext.Provider value={config}>{children}</StudioConfigContext.Provider>;
};
