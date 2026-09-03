import { createFileRoute, redirect } from "@tanstack/react-router";

function LegacyWorkspaceChatIndexRoute() {
  return null;
}

export const Route = createFileRoute("/w/$slug/chat/")({
  component: LegacyWorkspaceChatIndexRoute,
  loader: ({ params }) => {
    throw redirect({ href: `/w/${params.slug}/agent` });
  },
});
