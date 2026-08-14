import { createFileRoute } from "@tanstack/react-router";
import Template from "@/components/features/mastra-studio/upstream/pages/templates/template";
import type { RouteHeaderHandle } from "@/components/features/mastra-studio/upstream/lib/route-header";

export const Route = createFileRoute("/platform/mastra-studio/_main/templates_/$templateSlug")({
  component: Template,
  staticData: {
    handle: {
      crumbs: ({ params }) => [
        { id: "templates", label: "Templates", to: "/templates" },
        { id: "template", label: params.templateSlug ?? "Template" },
      ],
    } satisfies RouteHeaderHandle,
  },
});
