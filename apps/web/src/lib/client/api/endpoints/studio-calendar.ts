import type {
  StudioAiCalendarEventPreview,
  StudioCalendarEvent,
  StudioCalendarRoundEvaluation,
} from "@app/shared/studio-calendar";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function fetchStudioCalendar(slug: string, start: string, end: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.calendar.$get({
      param: { slug },
      query: { end, start },
    }),
    "加载面试日程失败",
  );
}

export function fetchStudioAiCalendarEventPreview(
  slug: string,
  roundId: string,
  conversationId: string | null,
): Promise<StudioAiCalendarEventPreview | null> {
  return rpcFetch(
    rpc.api.w[":slug"].studio.calendar["ai-events"][":roundId"].preview.$get({
      param: { roundId, slug },
      query: conversationId ? { conversationId } : {},
    }),
    "加载 AI 面试事件详情失败",
    { allow404: true },
  );
}

export function fetchStudioCalendarRoundEvaluation(
  slug: string,
  kind: StudioCalendarEvent["kind"],
  roundId: string,
): Promise<StudioCalendarRoundEvaluation | null> {
  const endpoint =
    kind === "ai"
      ? rpc.api.w[":slug"].studio.calendar["ai-events"][":roundId"].evaluation
      : rpc.api.w[":slug"].studio.calendar["human-events"][":roundId"].evaluation;
  return rpcFetch(endpoint.$get({ param: { roundId, slug } }), "加载面试评价失败", {
    allow404: true,
  });
}
