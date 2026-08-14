import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { getJoinPreview } from "@arc/ai-recruitment-copilot-backend/server/routes/join/dao";
import { codeParamsSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/join/schema";
import { InvalidJoinLink } from "@/components/features/join/invalid-join-link";
import { JoinClient } from "@/components/features/join/join-client";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { codeInputSchema } from "@/lib/start/server-fn-validators";

type JoinRouteState =
  | { status: "invalid" }
  | { code: string; status: "login_required" }
  | { status: "already_member"; workspaceSlug: string }
  | {
      code: string;
      initialRole: string;
      status: "ready";
      workspace: {
        id: string;
        logo: string | null;
        name: string;
        slug: string;
      };
    };

const getJoinRouteState = createServerFn({ method: "GET" })
  .validator(codeInputSchema)
  .handler(async ({ data }): Promise<JoinRouteState> => {
    const parsed = codeParamsSchema.safeParse({ code: data.code });
    if (!parsed.success) {
      return { status: "invalid" };
    }

    const requestHeaders = getRequestHeaders();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId = session?.user?.id ?? null;
    const preview = await getJoinPreview({ code: parsed.data.code, userId });

    if (!preview.valid || !preview.workspace) {
      return { status: "invalid" };
    }

    if (!userId) {
      return { code: parsed.data.code, status: "login_required" };
    }

    if (preview.alreadyMember) {
      return { status: "already_member", workspaceSlug: preview.workspace.slug };
    }

    return {
      code: parsed.data.code,
      initialRole: preview.initialRole ?? NO_ACCESS_WORKSPACE_ROLE,
      status: "ready",
      workspace: preview.workspace,
    };
  });

function JoinRoute() {
  const state = useLoaderData({ from: "/join/$code" });

  if (state.status !== "ready") {
    return <InvalidJoinLink />;
  }

  return (
    <JoinClient code={state.code} initialRole={state.initialRole} workspace={state.workspace} />
  );
}

export const Route = createFileRoute("/join/$code")({
  loader: async ({ params }) => {
    const state = await getJoinRouteState({ data: { code: params.code } });

    if (state.status === "login_required") {
      throw redirect({
        href: `/login?returnTo=${encodeURIComponent(`/join/${state.code}`)}`,
      });
    }

    if (state.status === "already_member") {
      throw redirect({ href: `/w/${state.workspaceSlug}/agent` });
    }

    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("加入工作区") }],
  }),
  component: JoinRoute,
});
