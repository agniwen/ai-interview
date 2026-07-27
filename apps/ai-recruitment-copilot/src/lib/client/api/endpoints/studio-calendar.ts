import type {
  StudioAiCalendarEventPreview,
  StudioCalendarResponse,
} from "@arc/shared/studio-calendar";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function fetchStudioCalendar(slug: string, start: string, end: string) {
  return rpcFetch<StudioCalendarResponse>(
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
  return rpcFetch<StudioAiCalendarEventPreview>(
    rpc.api.w[":slug"].studio.calendar["ai-events"][":roundId"].preview.$get({
      param: { roundId, slug },
      query: conversationId ? { conversationId } : {},
    }),
    "加载 AI 面试事件详情失败",
    { allow404: true },
  );
}
