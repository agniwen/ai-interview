import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import {
  createMeetingQuestionSchema,
  MEETING_ANSWER_REQUEST_BODY_MAX_BYTES,
} from "@arc/shared/meeting-answer";
import { askMeetingQuestion } from "../../../../answers/service";

export interface MeetingQuestionMessagesDependencies {
  askMeetingQuestion: (
    input: Parameters<typeof askMeetingQuestion>[0],
  ) => Promise<
    | { id: string; status: string }
    | "active-question"
    | "conflict"
    | "not-ready"
    | "rate-limited"
    | "thread-limit"
    | "unavailable"
    | null
  >;
}

const defaultDependencies: MeetingQuestionMessagesDependencies = { askMeetingQuestion };

export function createMeetingQuestionMessagesRouter(
  dependencies: MeetingQuestionMessagesDependencies = defaultDependencies,
) {
  return factory.createApp().post(
    "/",
    bodyLimit({
      maxSize: MEETING_ANSWER_REQUEST_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: "Meeting Question 请求体过大" }, 413),
    }),
    zValidator(
      "json",
      createMeetingQuestionSchema,
      jsonValidatorError("Meeting Question 请求无效"),
    ),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      const threadId = c.req.param("threadId");
      if (!(meetingId && threadId)) {
        return c.json({ error: "Meeting Question thread 不存在" }, 404);
      }
      const result = await dependencies.askMeetingQuestion({
        ...c.req.valid("json"),
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        threadId,
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Question thread 不存在" }, 404);
      }
      if (result === "conflict") {
        return c.json({ error: "requestId 已用于另一条 Meeting Question" }, 409);
      }
      if (result === "not-ready") {
        return c.json({ error: "当前权威会议转录尚未就绪" }, 409);
      }
      if (result === "active-question") {
        return c.json({ error: "请等待当前问题回答完成后再继续提问" }, 409);
      }
      if (result === "thread-limit") {
        return c.json({ error: "当前提问线程已达问题数量上限，请创建线程" }, 409);
      }
      if (result === "rate-limited") {
        c.header("Retry-After", "60");
        return c.json({ error: "提问过于频繁，请稍后再试" }, 429);
      }
      if (result === "unavailable") {
        return c.json({ error: "Meeting Answer 服务暂不可用" }, 503);
      }
      return c.json(result, 202);
    },
  );
}

export const meetingQuestionMessagesRouter = createMeetingQuestionMessagesRouter();
