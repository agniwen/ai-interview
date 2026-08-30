/**
 * Desktop QueryClient factory.
 * Electron renderer is always a long-lived browser context — reuse one singleton
 * so query caches are shared across navigations.
 */
import { createQueryClient } from "@arc/shared/query-client";

let queryClient: ReturnType<typeof createQueryClient> | undefined;

export function getQueryClient() {
  if (!queryClient) {
    queryClient = createQueryClient();
  }
  return queryClient;
}
