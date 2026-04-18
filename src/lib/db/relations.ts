import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  chatAttachment: {
    user: r.one.user({
      from: r.chatAttachment.userId,
      to: r.user.id,
    }),
  },
  chatConversation: {
    messages: r.many.chatMessage(),
    user: r.one.user({
      from: r.chatConversation.userId,
      to: r.user.id,
    }),
  },
  chatMessage: {
    conversation: r.one.chatConversation({
      from: r.chatMessage.conversationId,
      to: r.chatConversation.id,
    }),
  },
  interviewConversation: {
    interviewRecord: r.one.studioInterview({
      from: r.interviewConversation.interviewRecordId,
      to: r.studioInterview.id,
    }),
    turns: r.many.interviewConversationTurn(),
  },
  interviewConversationTurn: {
    conversation: r.one.interviewConversation({
      from: r.interviewConversationTurn.conversationId,
      to: r.interviewConversation.conversationId,
    }),
    interviewRecord: r.one.studioInterview({
      from: r.interviewConversationTurn.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  studioInterview: {
    conversationTurns: r.many.interviewConversationTurn(),
    conversations: r.many.interviewConversation(),
    scheduleEntries: r.many.studioInterviewSchedule(),
    user: r.one.user({
      from: r.studioInterview.createdBy,
      to: r.user.id,
    }),
  },
  studioInterviewSchedule: {
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewSchedule.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  user: {
    account: r.many.account(),
    chatAttachment: r.many.chatAttachment(),
    chatConversation: r.many.chatConversation(),
    session: r.many.session(),
    studioInterview: r.many.studioInterview(),
  },
}));
