import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface InterviewResolveState {
  roundId: string | null;
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const resolveInterviewRoundState = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<InterviewResolveState> => {
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/interview/${encodeURIComponent(data.id)}/resolve`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { roundId: null };
      }
      const payload = (await response.json()) as { roundId?: string };
      return { roundId: payload.roundId ?? null };
    } catch {
      return { roundId: null };
    }
  });

function InterviewByIdRoute() {
  const { roundId } = useLoaderData({ from: "/interview/$id" });

  if (roundId) {
    return null;
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">当前面试链接不可用。</p>
      </div>
    </>
  );
}

export const Route = createFileRoute("/interview/$id")({
  component: InterviewByIdRoute,
  loader: async ({ params }) => {
    const state = await resolveInterviewRoundState({ data: { id: params.id } });
    if (state.roundId) {
      throw redirect({ href: `/interview/${params.id}/${state.roundId}` });
    }
    return state;
  },
});
