import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, r => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  user: {
    account: r.many.account(),
    session: r.many.session(),
    studioInterview: r.many.studioInterview(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  studioInterview: {
    user: r.one.user({
      from: r.studioInterview.createdBy,
      to: r.user.id,
    }),
    scheduleEntries: r.many.studioInterviewSchedule(),
    conversations: r.many.interviewConversation(),
    conversationTurns: r.many.interviewConversationTurn(),
  },
  studioInterviewSchedule: {
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewSchedule.interviewRecordId,
      to: r.studioInterview.id,
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
}));
