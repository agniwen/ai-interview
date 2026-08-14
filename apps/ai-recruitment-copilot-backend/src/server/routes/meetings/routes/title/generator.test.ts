import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateTextWithMastraAgent: vi.fn(),
  titleAgent: {},
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/mastra/models", () => ({
  getMastraModelApiKey: () => "configured",
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => mocks,
);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { generateRecordingTitle, sanitizeRecordingTitle } from "./generator";

describe("recording title generator", () => {
  beforeEach(() => {
    mocks.generateTextWithMastraAgent.mockReset();
  });

  it("normalizes model output into a short plain title", () => {
    expect(sanitizeRecordingTitle("“ 第三季度  产品发布安排。 ”")).toBe("第三季度 产品发布安排");
    expect(sanitizeRecordingTitle("很长".repeat(20))).toHaveLength(28);
  });

  it("reserves enough output tokens for reasoning models to emit the title", async () => {
    mocks.generateTextWithMastraAgent.mockResolvedValue("奇异博士开启第三只眼");

    await expect(generateRecordingTitle("奇异博士打开第三只眼并帮助创立斗界")).resolves.toBe(
      "奇异博士开启第三只眼",
    );

    expect(mocks.generateTextWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 256 }),
    );
  });
});
