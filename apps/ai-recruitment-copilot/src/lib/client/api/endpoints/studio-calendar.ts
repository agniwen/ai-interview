import type { StudioCalendarResponse } from "@arc/shared/studio-calendar";
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
