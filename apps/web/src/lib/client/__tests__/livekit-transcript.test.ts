import type { ReceivedMessage } from "@livekit/components-react";
import { describe, expect, it } from "vitest";
import { coalesceSessionMessages } from "@/lib/client/livekit-transcript";

function participant(identity: string, isLocal = false): NonNullable<ReceivedMessage["from"]> {
  // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
  return { identity, isLocal } as NonNullable<ReceivedMessage["from"]>;
}

function userTranscript(id: string, message: string, identity = "candidate"): ReceivedMessage {
  return {
    from: participant(identity, true),
    id,
    message,
    timestamp: Number(id.replaceAll(/\D/g, "") || 0),
    type: "userTranscript",
  };
}

function agentTranscript(id: string, message: string): ReceivedMessage {
  return {
    from: participant("agent"),
    id,
    message,
    timestamp: Number(id.replaceAll(/\D/g, "") || 0),
    type: "agentTranscript",
  };
}

function chatMessage(id: string, message: string, identity = "candidate"): ReceivedMessage {
  return {
    from: participant(identity, true),
    id,
    message,
    timestamp: Number(id.replaceAll(/\D/g, "") || 0),
    type: "chatMessage",
  };
}

describe("coalesceSessionMessages", () => {
  it("merges consecutive user transcript segments from the same participant", () => {
    const result = coalesceSessionMessages([
      userTranscript("u1", "最大的成就是在 VLO"),
      userTranscript("u2", "然后把一个视频 SDK 项目"),
      userTranscript("u3", "0 到 1 做到了一万多日活"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "u1",
      message: "最大的成就是在 VLO 然后把一个视频 SDK 项目 0 到 1 做到了一万多日活",
      type: "userTranscript",
    });
  });

  it("does not merge across an agent transcript", () => {
    const result = coalesceSessionMessages([
      userTranscript("u1", "第一段"),
      agentTranscript("a1", "好的"),
      userTranscript("u2", "第二段"),
    ]);

    expect(result.map((message) => message.message)).toEqual(["第一段", "好的", "第二段"]);
  });

  it("does not merge chat messages into transcripts", () => {
    const result = coalesceSessionMessages([
      userTranscript("u1", "语音内容"),
      chatMessage("c1", "文字输入"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((message) => message.message)).toEqual(["语音内容", "文字输入"]);
  });

  it("does not merge different user identities", () => {
    const result = coalesceSessionMessages([
      userTranscript("u1", "候选人"),
      userTranscript("u2", "另一个人", "other"),
    ]);

    expect(result).toHaveLength(2);
  });
});

function replay(
  message: ReceivedMessage,
  batch: string,
  index: number,
  count: number,
): ReceivedMessage {
  return {
    ...message,
    attributes: {
      "interview.replay_batch": batch,
      "interview.replay_count": String(count),
      "interview.replay_index": String(index),
    },
  };
}

it("replaces retained transcript history with a complete reconnect snapshot", () => {
  const messages = [
    agentTranscript("a1", "你好"),
    userTranscript("u1", "准备好了"),
    replay(agentTranscript("r1", "你好"), "b1", 0, 2),
    replay(userTranscript("r2", "准备好了"), "b1", 1, 2),
    agentTranscript("a2", "第一份工作？"),
  ];
  expect(coalesceSessionMessages(messages).map((m) => m.message)).toEqual([
    "你好",
    "准备好了",
    "第一份工作？",
  ]);
});

it("preserves real repeated answers and live turns arriving during replay", () => {
  const messages = [
    agentTranscript("a1", "你好"),
    replay(agentTranscript("r1", "你好"), "b1", 0, 3),
    replay(userTranscript("r2", "不知道"), "b1", 1, 3),
    agentTranscript("new", "还有补充吗？"),
    replay(agentTranscript("r3", "不知道什么？"), "b1", 2, 3),
    userTranscript("u2", "不知道"),
  ];
  expect(coalesceSessionMessages(messages).map((m) => m.message)).toEqual([
    "你好",
    "不知道",
    "不知道什么？",
    "还有补充吗？",
    "不知道",
  ]);
});

it("keeps existing history if replay is incomplete", () => {
  const original = agentTranscript("a1", "你好");
  const result = coalesceSessionMessages([
    original,
    replay(agentTranscript("r1", "你好"), "b1", 0, 2),
  ]);
  expect(result).toContainEqual(original);
});
