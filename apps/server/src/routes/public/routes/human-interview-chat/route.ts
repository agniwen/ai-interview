import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
  resolveHumanInterviewMeetingInterviewerInviteToken,
  resolveHumanInterviewMeetingInviteToken,
} from "../../../studio/routes/interviews/dao/human-interview-meetings";
import { listHumanInterviewChatMessages, saveHumanInterviewChatMessage } from "./dao";

const messageInputSchema = z.object({
  id: z.uuid(),
  message: z.string().trim().min(1).max(2000),
});

interface ChatScope {
  canRead: boolean;
  meetingId: string;
  organizationId: string;
  participantIdentity: string;
  scheduledAt: string | null;
  senderName: string;
  status: string;
  validUntil: string | null;
}

interface Dependencies {
  list: typeof listHumanInterviewChatMessages;
  resolveCandidate: (token: string) => Promise<ChatScope | null>;
  resolveInterviewer: (token: string) => Promise<ChatScope | null>;
  save: typeof saveHumanInterviewChatMessage;
}

const defaultDependencies: Dependencies = {
  list: listHumanInterviewChatMessages,
  async resolveCandidate(token) {
    const scope = await resolveHumanInterviewMeetingInviteToken(token);
    return scope
      ? {
          canRead: scope.candidateInviteStatus === "accepted",
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          participantIdentity: `candidate_${scope.roundId}`,
          scheduledAt: scope.scheduledAt,
          senderName: scope.candidateName,
          status: scope.status,
          validUntil: scope.validUntil,
        }
      : null;
  },
  async resolveInterviewer(token) {
    const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(token);
    return scope
      ? {
          canRead: true,
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          participantIdentity: `interviewer_${scope.userId}`,
          scheduledAt: scope.scheduledAt,
          senderName: scope.interviewerName,
          status: scope.status,
          validUntil: scope.validUntil,
        }
      : null;
  },
  save: saveHumanInterviewChatMessage,
};

function canSend(scope: ChatScope) {
  return (
    scope.canRead &&
    (scope.status === "scheduled" || scope.status === "in_progress") &&
    !isHumanInterviewMeetingBeforeScheduledStart(scope.scheduledAt) &&
    !isHumanInterviewMeetingAfterValidUntil(scope.validUntil)
  );
}

export function createHumanInterviewChatRouter(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .get("/interviewer/:inviteToken/chat-messages", async (c) => {
      const scope = await dependencies.resolveInterviewer(c.req.param("inviteToken"));
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (!scope.canRead) {
        return c.json({ error: "当前无法查看会议聊天。" }, 403);
      }
      const messages = await dependencies.list(scope);
      c.header("Cache-Control", "no-store");
      return c.json({ messages }, 200);
    })
    .post(
      "/interviewer/:inviteToken/chat-messages",
      zValidator("json", messageInputSchema, jsonValidatorError("聊天消息无效。")),
      async (c) => {
        const scope = await dependencies.resolveInterviewer(c.req.param("inviteToken"));
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        if (!canSend(scope)) {
          return c.json({ error: "当前无法发送会议消息。" }, 403);
        }
        const message = await dependencies.save({ ...scope, ...c.req.valid("json") });
        return message ? c.json({ message }, 201) : c.json({ error: "消息编号已被使用。" }, 409);
      },
    )
    .get("/:inviteToken/chat-messages", async (c) => {
      const scope = await dependencies.resolveCandidate(c.req.param("inviteToken"));
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (!scope.canRead) {
        return c.json({ error: "请先确认参加面试。" }, 403);
      }
      const messages = await dependencies.list(scope);
      c.header("Cache-Control", "no-store");
      return c.json({ messages }, 200);
    })
    .post(
      "/:inviteToken/chat-messages",
      zValidator("json", messageInputSchema, jsonValidatorError("聊天消息无效。")),
      async (c) => {
        const scope = await dependencies.resolveCandidate(c.req.param("inviteToken"));
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        if (!canSend(scope)) {
          return c.json({ error: "当前无法发送会议消息。" }, 403);
        }
        const message = await dependencies.save({ ...scope, ...c.req.valid("json") });
        return message ? c.json({ message }, 201) : c.json({ error: "消息编号已被使用。" }, 409);
      },
    );
}

export const humanInterviewChatRouter = createHumanInterviewChatRouter();
