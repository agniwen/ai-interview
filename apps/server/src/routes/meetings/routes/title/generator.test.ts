import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateRecordingTitle, sanitizeRecordingTitle } from "./generator";
import type { RecordingTitleDependencies } from "./generator";

const mocks = {
  generateTitleText: vi.fn<RecordingTitleDependencies["generateTitleText"]>(),
};

const dependencies: RecordingTitleDependencies = {
  ...mocks,
  isModelConfigured: () => true,
};

describe("recording title generator", () => {
  beforeEach(() => {
    mocks.generateTitleText.mockReset();
  });

  it("normalizes model output into a short plain title", () => {
    expect(sanitizeRecordingTitle("“ 第三季度  产品发布安排。 ”")).toBe("第三季度 产品发布安排");
    expect(sanitizeRecordingTitle("很长".repeat(20))).toHaveLength(28);
  });

  it("reserves enough output tokens for reasoning models to emit the title", async () => {
    mocks.generateTitleText.mockResolvedValue("奇异博士开启第三只眼");

    await expect(
      generateRecordingTitle("奇异博士打开第三只眼并帮助创立斗界", dependencies),
    ).resolves.toBe("奇异博士开启第三只眼");

    expect(mocks.generateTitleText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 256 }),
    );
  });
});
