import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/app-version")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { buildTime: __ARC_BUILD_TIME__ },
          {
            headers: {
              "Cache-Control": "no-store",
            },
          },
        ),
    },
  },
});
