import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { HomeAuthRedirect } from "@/components/features/home/home-auth-redirect";
import HomeShell from "@/components/features/home/home-shell";
import { skyPosterPreconnectLink } from "@/components/features/sky/sky-assets";
import { ROOT_DOCUMENT_TITLE } from "@/lib/start/document-title";
import * as m from "@/paraglide/messages";

const homeSearchSchema = z.object({
  goto: z.enum(["agent", "chat", "studio"]).optional(),
});

function HomeRoute() {
  const { goto } = useSearch({ from: "/" });

  return (
    <>
      <HomeAuthRedirect goto={goto} />
      <HomeShell />
    </>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  head: () => ({
    links: [skyPosterPreconnectLink],
    meta: [
      { title: ROOT_DOCUMENT_TITLE },
      { content: m.home_document_description(), name: "description" },
    ],
  }),
  component: HomeRoute,
});
