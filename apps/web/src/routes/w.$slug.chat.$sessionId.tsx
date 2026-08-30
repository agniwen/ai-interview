import { createFileRoute, redirect } from "@tanstack/react-router";

function LegacyWorkspaceChatSessionRoute() {
  return null;
}

export const Route = createFileRoute("/w/$slug/chat/$sessionId")({
  component: LegacyWorkspaceChatSessionRoute,
  loader: ({ params }) => {
    throw redirect({ href: `/w/${params.slug}/agent/${params.sessionId}` });
  },
});
