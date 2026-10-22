import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/interview/")({
  loader: () => {
    throw redirect({ href: "/" });
  },
});
