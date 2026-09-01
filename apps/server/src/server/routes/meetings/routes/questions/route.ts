import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  createMeetingQuestionThreadSchema,
  MEETING_ANSWER_REQUEST_BODY_MAX_BYTES,
} from "@arc/shared/meeting-answer";
import {
  askMeetingQuestion,
  createSavedMeetingQuestionThread,
  getSavedMeetingQuestionThread,
  listSavedMeetingQuestionThreads,
} from "../../answers/service";
import { createMeetingQuestionMessagesRouter } from "./routes/messages/route";
import type { MeetingQuestionMessagesDependencies } from "./routes/messages/route";

interface MeetingQuestionThreadRecord {
  id: string;
  title: string;
}

export interface MeetingQuestionsDependencies extends MeetingQuestionMessagesDependencies {
  createSavedMeetingQuestionThread: (
    input: Parameters<typeof createSavedMeetingQuestionThread>[0],
  ) => Promise<MeetingQuestionThreadRecord | "limit-reached" | null>;
  getSavedMeetingQuestionThread: (
    input: Parameters<typeof getSavedMeetingQuestionThread>[0],
  ) => Promise<MeetingQuestionThreadRecord | null>;
  listSavedMeetingQuestionThreads: (
    input: Parameters<typeof listSavedMeetingQuestionThreads>[0],
  ) => Promise<MeetingQuestionThreadRecord[] | null>;
}

const defaultDependencies: MeetingQuestionsDependencies = {
  askMeetingQuestion,
  createSavedMeetingQuestionThread,
  getSavedMeetingQuestionThread,
  listSavedMeetingQuestionThreads,
};

export function createMeetingQuestionsRouter(
  dependencies: MeetingQuestionsDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/", async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const records = await dependencies.listSavedMeetingQuestionThreads({
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        userId: user.id,
      });
      return records ? c.json({ records }, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
    })
    .post(
      "/",
      bodyLimit({
        maxSize: MEETING_ANSWER_REQUEST_BODY_MAX_BYTES,
        onError: (c) => c.json({ error: "Meeting Question 请求体过大" }, 413),
      }),
      zValidator(
        "json",
        createMeetingQuestionThreadSchema,
        jsonValidatorError("Meeting Question thread 请求无效"),
      ),
      async (c) => {
        const { activeOrg, member, user } = c.var;
        if (!(activeOrg && member && user)) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const meetingId = c.req.param("id");
        if (!meetingId) {
          return c.json({ error: "Meeting Session 不存在" }, 404);
        }
        const result = await dependencies.createSavedMeetingQuestionThread({
          meetingId,
          memberRole: member.role,
          organizationId: activeOrg.id,
          title: c.req.valid("json").title,
          userId: user.id,
        });
        if (result === "limit-reached") {
          return c.json({ error: "单场会议的提问线程数量已达上限" }, 409);
        }
        return result ? c.json(result, 201) : c.json({ error: "Meeting Session 不存在" }, 404);
      },
    )
    .route("/:threadId/messages", createMeetingQuestionMessagesRouter(dependencies))
    .get("/:threadId", async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await dependencies.getSavedMeetingQuestionThread({
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        threadId: c.req.param("threadId"),
        userId: user.id,
      });
      return result
        ? c.json(result, 200)
        : c.json({ error: "Meeting Question thread 不存在" }, 404);
    });
}

export const meetingQuestionsRouter = createMeetingQuestionsRouter();
