import "overlayscrollbars/overlayscrollbars.css";
import "./assets/main.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getQueryClient } from "@/lib/query-client";
import { createDesktopRouter } from "@/router";

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error('Root element "#root" not found');
}

const queryClient = getQueryClient();
const router = createDesktopRouter(queryClient);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
