import { afterEach, describe, expect, it, vi } from "vitest";
import type { MastraGeneratorLike } from "@app/ai-runtime/simple-generators";
import { generateMeetingRecognitionHints } from "./meeting-recognition-hints";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("meeting recognition terminology", () => {
  it.each([
    ["deepseek-v4-flash-0731", "qwen-plus", false],
    ["qwen-plus", "deepseek-v4-flash-0731", true],
  ] as const)("uses the fast model's output capability (%s)", async (fast, structured, native) => {
    vi.stubEnv("MASTRA_FAST_MODEL", fast);
    vi.stubEnv("MASTRA_STRUCTURED_MODEL", structured);
    vi.resetModules();
    const { generateMeetingRecognitionHints: generateHints } =
      await import("./meeting-recognition-hints");
    const generate = vi.fn<MastraGeneratorLike["generate"]>((_prompt, options) => {
      if (options?.structuredOutput && !native) {
        return Promise.reject(
          new Error("response_format json_schema is not supported by this model"),
        );
      }
      return Promise.resolve({ object: { terms: ["IM"] }, text: '{"terms":["IM"]}' });
    });
    await expect(generateHints(["IM 项目"], { generate })).resolves.toEqual({ terms: ["IM"] });
    expect(generate).toHaveBeenCalledOnce();
    expect(Boolean(generate.mock.calls[0]?.[1]?.structuredOutput)).toBe(native);
  });

  it("skips the model when no interview materials exist", async () => {
    const agent = { generate: vi.fn() };
    expect(await generateMeetingRecognitionHints(["", "  "], agent)).toEqual({ terms: [] });
    expect(agent.generate).not.toHaveBeenCalled();
  });

  it("removes source-backed contact details and does not infer acronym expansions", async () => {
    const agent = {
      generate: vi.fn(() =>
        Promise.resolve({
          text: JSON.stringify({
            terms: ["IM", "即时通信", "a@example.test", "13800000000", "https://example.test"],
          }),
        }),
      ),
    };
    expect(
      await generateMeetingRecognitionHints(
        ["IM 项目 联系方式 a@example.test 13800000000 https://example.test"],
        agent,
      ),
    ).toEqual({ terms: ["IM"] });
  });

  it.each([
    ["销售岗位：渠道回款与商机管理", ["渠道回款", "商机"]],
    ["运营岗位：投放归因、留存与转化率", ["投放归因", "留存", "转化率"]],
    ["财务岗位：应收账款核销与合并报表", ["应收账款", "核销", "合并报表"]],
    ["人力岗位：招聘交付、薪酬绩效", ["招聘交付", "薪酬绩效"]],
    ["研发岗位：IM 即时通信项目与 WebSocket", ["IM", "即时通信", "WebSocket"]],
  ] as const)("extracts source-backed terminology for %s", async (document, expected) => {
    const agent = {
      generate: vi.fn(() =>
        Promise.resolve({
          text: JSON.stringify({ terms: [...expected, expected[0], "凭空编造的术语"] }),
        }),
      ),
    };
    expect(await generateMeetingRecognitionHints([document], agent)).toEqual({ terms: expected });
  });
});
