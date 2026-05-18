// 模型 id 白名单与解析测试 / Model id allowlist + resolver tests.

import { describe, expect, it } from "vitest";
import {
  describeModelId,
  isChatCapableId,
  resolveChatModelId,
} from "@/server/agents/model-catalog";

describe("isChatCapableId — third-party / deployment prefixes", () => {
  it.each(["vanchin/deepseek-v4", "siliconflow/qwen-plus", "kimi/kimi-k2", "any/thing"])(
    "rejects %s (has slash)",
    (id) => {
      expect(isChatCapableId(id)).toBe(false);
    },
  );
});

describe("isChatCapableId — dash-count guard for dated snapshots", () => {
  it("rejects ids with > 3 dashes (dated snapshots)", () => {
    expect(isChatCapableId("qwen-plus-2025-12-01")).toBe(false);
    expect(isChatCapableId("qwen3.6-plus-2026-04-02")).toBe(false);
    expect(isChatCapableId("deepseek-v4-pro-2026-01-01")).toBe(false);
  });

  it("keeps ids with <= 3 dashes", () => {
    // 这些都是 2 个横线 / each of these has 2 dashes
    expect(isChatCapableId("qwen3.6-max-preview")).toBe(true);
    expect(isChatCapableId("glm-4.5-air")).toBe(true);
    expect(isChatCapableId("deepseek-v4-pro")).toBe(true);
  });
});

describe("isChatCapableId — provider prefix allowlist", () => {
  it.each([
    "minimax-text-01",
    "kimi-k2",
    "moonshot-v1",
    "glm-4.5",
    "glm-4.5-air",
    "deepseek-v4-pro",
    "deepseek-r1",
  ])("accepts %s", (id) => {
    expect(isChatCapableId(id)).toBe(true);
  });

  it("treats provider check as case-insensitive (matches docs)", () => {
    expect(isChatCapableId("DeepSeek-v4-pro")).toBe(true);
    expect(isChatCapableId("MINIMAX-text-01")).toBe(true);
  });
});

describe("isChatCapableId — Qwen max/plus rule", () => {
  it("accepts qwen-max / qwen-plus exact ids", () => {
    expect(isChatCapableId("qwen-max")).toBe(true);
    expect(isChatCapableId("qwen-plus")).toBe(true);
  });

  it("accepts qwen<ver>-max / qwen<ver>-plus with suffixes", () => {
    expect(isChatCapableId("qwen3.6-max-preview")).toBe(true);
    expect(isChatCapableId("qwen-plus-latest")).toBe(true);
    expect(isChatCapableId("qwen3.5-plus")).toBe(true);
  });

  it.each([
    "qwen-flash",
    "qwen-turbo",
    "qwen-coder-plus",
    "qwen-vl-max",
    "qwen-vl-plus",
    "qwq-32b",
    "qwen3.5-flash",
  ])("rejects %s (qwen but not -max/-plus shape)", (id) => {
    expect(isChatCapableId(id)).toBe(false);
  });

  it("rejects clearly non-chat services regardless of provider", () => {
    expect(isChatCapableId("text-embedding-v3")).toBe(false);
    expect(isChatCapableId("qwen-audio")).toBe(false);
    expect(isChatCapableId("ocr-vision")).toBe(false);
  });
});

describe("resolveChatModelId — upstream snapshot missing", () => {
  it("passes the user id through when upstream is null and id is non-empty", () => {
    expect(resolveChatModelId("anything", null, "fallback")).toBe("anything");
  });

  it("falls back when upstream is null and id is empty / null / undefined", () => {
    expect(resolveChatModelId("", null, "fallback")).toBe("fallback");
    expect(resolveChatModelId(null, null, "fallback")).toBe("fallback");
    expect(resolveChatModelId(undefined, null, "fallback")).toBe("fallback");
  });
});

describe("resolveChatModelId — upstream snapshot present", () => {
  it("returns the user id when it's in the snapshot", () => {
    const upstream = new Set(["qwen-plus", "deepseek-v4-pro"]);
    expect(resolveChatModelId("qwen-plus", upstream, "qwen-plus")).toBe("qwen-plus");
  });

  it("returns the fallback when user id is missing but fallback is in the snapshot", () => {
    const upstream = new Set(["qwen-plus", "fallback-id"]);
    expect(resolveChatModelId("unknown", upstream, "fallback-id")).toBe("fallback-id");
  });

  it("returns the first upstream entry when neither user id nor fallback are in the snapshot", () => {
    const upstream = new Set(["first", "second"]);
    expect(resolveChatModelId("unknown", upstream, "fallback-id")).toBe("first");
  });

  it("returns the fallback when upstream is empty (no first value to pick)", () => {
    const upstream = new Set<string>();
    expect(resolveChatModelId("unknown", upstream, "fallback-id")).toBe("fallback-id");
  });

  it("returns the fallback when user id is null but fallback is in the snapshot", () => {
    const upstream = new Set(["x", "fallback-id"]);
    expect(resolveChatModelId(null, upstream, "fallback-id")).toBe("fallback-id");
  });
});

describe("describeModelId — provider inference", () => {
  it.each([
    ["deepseek-v4-pro", "deepseek"],
    ["deepseek-r1", "deepseek"],
    ["kimi-k2", "moonshot"],
    ["moonshot-v1", "moonshot"],
    ["glm-4.5", "zhipu"],
    ["minimax-text-01", "minimax"],
    ["qwen-plus", "alibaba"],
    ["qwq-32b", "alibaba"],
    ["tongyi-foo", "alibaba"],
    ["unknown-thing", "other"],
  ])("describeModelId(%s).provider → %s", (id, provider) => {
    expect(describeModelId(id).provider).toBe(provider);
  });

  it("uses the tail segment when id is slash-prefixed", () => {
    expect(describeModelId("vanchin/deepseek-v4").provider).toBe("deepseek");
    expect(describeModelId("any/kimi-k2").provider).toBe("moonshot");
  });
});

describe("describeModelId — group inference", () => {
  it.each([
    ["deepseek-v4-flash", "fast"],
    ["kimi-turbo", "fast"],
    ["glm-4.5-air", "fast"],
    ["qwq-32b", "reasoning"],
    ["deepseek-r1", "reasoning"],
    ["deepseek-reasoner", "reasoning"],
    ["qwen-thinking", "reasoning"],
    ["qwen-long", "long"],
    ["qwen-plus-1m", "long"],
    ["qwen-plus", "balanced"],
    ["deepseek-v4-pro", "balanced"],
  ])("describeModelId(%s).group → %s", (id, group) => {
    expect(describeModelId(id).group).toBe(group);
  });
});

describe("describeModelId — basic shape", () => {
  it("uses the id as both id and label", () => {
    const out = describeModelId("qwen-plus");
    expect(out.id).toBe("qwen-plus");
    expect(out.label).toBe("qwen-plus");
  });
});
