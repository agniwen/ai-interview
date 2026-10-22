import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$slug/")({
  loader: ({ params }) => {
    throw redirect({ href: `/w/${params.slug}/studio` });
  },
});
