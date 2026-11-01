import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$slug/studio/")({
  loader: async ({ params }) => {
    const { getFirstAllowedStudioPagePath } = await import("@/lib/start/auth-session");
    const fallbackPath = await getFirstAllowedStudioPagePath({ data: { slug: params.slug } });
    if (!fallbackPath) {
      throw notFound();
    }
    throw redirect({ href: `/w/${params.slug}/studio${fallbackPath}` });
  },
});
