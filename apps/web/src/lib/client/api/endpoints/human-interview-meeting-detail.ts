import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function fetchHumanInterviewMeetingDetail(
  input: {
    slug: string;
    candidateId: string;
    roundId: string;
    meetingId: string;
  },
  signal?: AbortSignal,
) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"]["human-interview-rounds"][":roundId"].meetings[
      ":meetingId"
    ].$get(
      {
        param: {
          id: input.candidateId,
          meetingId: input.meetingId,
          roundId: input.roundId,
          slug: input.slug,
        },
      },
      { init: { signal } },
    ),
    "加载会议详情失败",
  );
}
