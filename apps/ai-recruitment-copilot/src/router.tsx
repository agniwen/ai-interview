import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "@/components/layout/not-found-view";
import { getQueryClient } from "@/lib/client/query-client";
import { routeTree } from "./routeTree.gen";

function DefaultNotFoundComponent() {
  return <NotFoundPage />;
}

export function getRouter() {
  const queryClient = getQueryClient();
  const router = createRouter({
    context: { queryClient },
    defaultNotFoundComponent: DefaultNotFoundComponent,
    defaultPreload: "intent",
    notFoundMode: "root",
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ queryClient, router });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
