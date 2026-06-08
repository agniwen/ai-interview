import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { initializePostHog } from "@/lib/client/analytics";

initializePostHog();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
