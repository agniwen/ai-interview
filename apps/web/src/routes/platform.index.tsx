import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/")({
  loader: () => {
    throw redirect({ href: "/platform/organizations" });
  },
});
