import type {
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewMeetingStatus,
} from "@app/db-schema/studio-interviews";

type HumanInterviewReviewMutation = "edit" | "submit";

export function resolveHumanInterviewReviewMutationAccess(
  scope: {
    role: HumanInterviewMeetingInterviewerRole;
    status: HumanInterviewMeetingStatus;
  },
  mutation: HumanInterviewReviewMutation,
): { message: string; status: 403 | 409 } | null {
  if (scope.role === "observer") {
    return { message: "旁听者只能查看真人复面内容。", status: 403 };
  }
  if (scope.status === "cancelled") {
    return { message: "已取消的真人复面不能修改复核内容。", status: 409 };
  }
  if (mutation === "submit" && scope.status !== "ended") {
    return { message: "请先结束真人复面，再提交本轮评价。", status: 409 };
  }
  return null;
}
