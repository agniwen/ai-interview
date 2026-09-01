import {
  getWorkspaceAiCalendarPreview,
  listWorkspaceCalendarEvents,
} from "@/lib/client/backend-api";
import type {
  StudioAiCalendarEventPreview,
  StudioCalendarEvent,
} from "@arc/shared/studio-calendar";

import { apiRequest } from "../rpc-fetch";

export function fetchStudioCalendar(
  slug: string,
  start: string,
  end: string,
): Promise<{ events: StudioCalendarEvent[] }> {
  return apiRequest<{ events: StudioCalendarEvent[] }>(
    listWorkspaceCalendarEvents({ path: { workspaceSlug: slug }, query: { end, start } }),

    "加载面试日程失败",
  );
}

export function fetchStudioAiCalendarEventPreview(
  slug: string,
  roundId: string,
  conversationId: string | null,
): Promise<StudioAiCalendarEventPreview | null> {
  return apiRequest(
    getWorkspaceAiCalendarPreview({
      path: { roundId, workspaceSlug: slug },
      query: conversationId ? { conversationId } : {},
    }),

    "加载 AI 面试事件详情失败",
    { allow404: true },
  );
}
