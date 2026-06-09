import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { GlobalConfigForm } from "@/components/studio/global-config/global-config-form";
import type { GlobalConfigRecord } from "@arc/shared/global-config";
import { slugInputSchema } from "@/lib/start/server-fn-validators";

type StudioGlobalConfigState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      initial: GlobalConfigRecord;
      status: "ready";
    };

const loadStudioGlobalConfigState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioGlobalConfigState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { getGlobalConfig } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    return {
      initial: await getGlobalConfig(access.workspace.id),
      status: "ready" as const,
    };
  });

function StudioGlobalConfigRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/global-config" });

  if (state.status !== "ready") {
    return null;
  }

  return <GlobalConfigForm initial={state.initial} />;
}

export const Route = createFileRoute("/w/$slug/studio/global-config")({
  component: StudioGlobalConfigRoute,
  head: () => ({
    meta: [{ title: "系统设置" }],
  }),
  loader: async ({ params }) => {
    const state = await loadStudioGlobalConfigState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/global-config`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
});
