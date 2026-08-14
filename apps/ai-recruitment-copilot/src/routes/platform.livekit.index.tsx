import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/livekit/")({
  loader: () => {
    throw redirect({ href: "/platform/livekit/overview" });
  },
});
