import { createFileRoute, redirect } from "@tanstack/react-router";

function LegacyWorkspaceChatRoute() {
  return null;
}

export const Route = createFileRoute("/w/$slug/chat")({
  component: LegacyWorkspaceChatRoute,
  loader: ({ params }) => {
    throw redirect({ href: `/w/${params.slug}/agent` });
  },
});
