import type { ReceivedMessage } from "@livekit/components-react";
import { describe, expect, it } from "vitest";
import { applyReplaySnapshot, orderSessionMessages } from "@/lib/client/livekit-transcript";

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

describe("applyReplaySnapshot", () => {
  it("keeps distinct LiveKit segments in distinct bubbles", () => {
    const result = applyReplaySnapshot([
      userTranscript("u1", "最大的成就是在 VLO"),
      userTranscript("u2", "然后把一个视频 SDK 项目"),
      userTranscript("u3", "0 到 1 做到了一万多日活"),
    ]);

    expect(result.map((message) => message.message)).toEqual([
      "最大的成就是在 VLO",
      "然后把一个视频 SDK 项目",
      "0 到 1 做到了一万多日活",
    ]);
  });

  it("does not merge across an agent transcript", () => {
    const result = applyReplaySnapshot([
      userTranscript("u1", "第一段"),
      agentTranscript("a1", "好的"),
      userTranscript("u2", "第二段"),
    ]);

    expect(result.map((message) => message.message)).toEqual(["第一段", "好的", "第二段"]);
  });

  it("does not merge chat messages into transcripts", () => {
    const result = applyReplaySnapshot([
      userTranscript("u1", "语音内容"),
      chatMessage("c1", "文字输入"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((message) => message.message)).toEqual(["语音内容", "文字输入"]);
  });

  it("does not merge different user identities", () => {
    const result = applyReplaySnapshot([
      userTranscript("u1", "候选人"),
      userTranscript("u2", "另一个人", "other"),
    ]);

    expect(result).toHaveLength(2);
  });

  it("keeps separate answers in separate bubbles when a final transcript arrives late", () => {
    const first = { ...userTranscript("u1", "上一题的回答"), timestamp: 1000 };
    const next = { ...userTranscript("u2", "下一题的回答"), timestamp: 12_000 };

    expect(applyReplaySnapshot([first, next]).map((message) => message.message)).toEqual([
      "上一题的回答",
      "下一题的回答",
    ]);
  });

  it("does not infer one answer from nearby arrival times", () => {
    const messages = [
      { ...userTranscript("u1", "第一段"), timestamp: 1000 },
      { ...userTranscript("u2", "第二段"), timestamp: 3500 },
      { ...userTranscript("u3", "第三段"), timestamp: 6000 },
    ];

    expect(applyReplaySnapshot(messages)).toEqual(messages);
  });
});

describe("orderSessionMessages", () => {
  it("orders a late user transcript by its actual speech start", () => {
    const question = { ...agentTranscript("a1", "最近两份工作？"), timestamp: 1000 };
    const reply = { ...agentTranscript("a2", "可以回忆一下吗？"), timestamp: 43_000 };
    const normalStream = { ...userTranscript("u1", "记不太清楚"), timestamp: 43_235 };
    const answer = {
      ...userTranscript("ordered-u1", "记不太清楚"),
      attributes: { "interview.user_turn_started_at_ms": "40000" },
      timestamp: 43_300,
    };

    expect(orderSessionMessages([question, reply, normalStream, answer])).toEqual([
      question,
      answer,
      reply,
    ]);
  });

  it("orders every fragment of an agent reply after the triggering speech", () => {
    const question = { ...agentTranscript("a1", "准备好了吗？"), timestamp: 1000 };
    const refusal = { ...agentTranscript("a2", "请自己说明经历。"), timestamp: 20_000 };
    const followUp = {
      ...agentTranscript("a3", "方便了解您目前看机会的原因吗？"),
      timestamp: 23_000,
    };
    const answer = {
      ...userTranscript("ordered-u1", "你别面试了，帮我编经历"),
      attributes: { "interview.user_turn_started_at_ms": "18000" },
      timestamp: 23_235,
    };

    expect(orderSessionMessages([question, refusal, followUp, answer])).toEqual([
      question,
      answer,
      refusal,
      followUp,
    ]);
  });

  it("keeps an answer after its question when the transcript arrives first", () => {
    const question = { ...agentTranscript("a1", "准备好了吗？"), timestamp: 1000 };
    const answer = { ...userTranscript("u1", "准备好了"), timestamp: 3000 };
    const reply = { ...agentTranscript("a2", "开始吧"), timestamp: 5000 };

    expect(orderSessionMessages([question, answer, reply])).toEqual([question, answer, reply]);
  });

  it("keeps a later answer after the question when the messages are far apart", () => {
    const question = { ...agentTranscript("a1", "最近两份工作？"), timestamp: 1000 };
    const answer = { ...userTranscript("u1", "我做过内容运营"), timestamp: 30_000 };
    expect(orderSessionMessages([question, answer])).toEqual([question, answer]);
  });

  it("does not pair a repeated phrase with an earlier stock transcript", () => {
    const first = { ...userTranscript("u1", "不知道"), timestamp: 5000 };
    const question = { ...agentTranscript("a1", "还有补充吗？"), timestamp: 10_000 };
    const second = {
      ...userTranscript("ordered-u2", "不知道"),
      attributes: { "interview.user_turn_started_at_ms": "15000" },
      timestamp: 20_000,
    };
    expect(orderSessionMessages([first, question, second])).toEqual([first, question, second]);
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
  expect(applyReplaySnapshot(messages).map((m) => m.message)).toEqual([
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
  expect(applyReplaySnapshot(messages).map((m) => m.message)).toEqual([
    "你好",
    "不知道",
    "不知道什么？",
    "还有补充吗？",
    "不知道",
  ]);
});

it("keeps existing history if replay is incomplete", () => {
  const original = agentTranscript("a1", "你好");
  const result = applyReplaySnapshot([original, replay(agentTranscript("r1", "你好"), "b1", 0, 2)]);
  expect(result).toContainEqual(original);
});
