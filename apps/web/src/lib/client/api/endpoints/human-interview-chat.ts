import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export interface HumanInterviewChatAccess {
  mode: "candidate" | "interviewer";
  inviteToken: string;
}

export function fetchHumanInterviewChatMessages(access: HumanInterviewChatAccess) {
  const { inviteToken } = access;
  return access.mode === "interviewer"
    ? rpcFetch(
        rpc.api.public["human-interview-meetings"].interviewer[":inviteToken"][
          "chat-messages"
        ].$get({
          param: { inviteToken },
        }),
        "加载聊天记录失败",
      )
    : rpcFetch(
        rpc.api.public["human-interview-meetings"][":inviteToken"]["chat-messages"].$get({
          param: { inviteToken },
        }),
        "加载聊天记录失败",
      );
}

export function saveHumanInterviewChatMessage(
  access: HumanInterviewChatAccess,
  input: { id: string; message: string },
) {
  const { inviteToken } = access;
  return access.mode === "interviewer"
    ? rpcFetch(
        rpc.api.public["human-interview-meetings"].interviewer[":inviteToken"][
          "chat-messages"
        ].$post({
          json: input,
          param: { inviteToken },
        }),
        "保存聊天消息失败",
      )
    : rpcFetch(
        rpc.api.public["human-interview-meetings"][":inviteToken"]["chat-messages"].$post({
          json: input,
          param: { inviteToken },
        }),
        "保存聊天消息失败",
      );
}
