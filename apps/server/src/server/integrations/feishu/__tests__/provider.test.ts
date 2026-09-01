import { afterEach, describe, expect, it, vi } from "vitest";
import { getFeishuEvaluationFolderToken, isFeishuHumanInterviewEnabled } from "../provider";

describe("getFeishuEvaluationFolderToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the folder configured for each Feishu provider", () => {
    vi.stubEnv("FEISHU_EVALUATION_FOLDER_TOKEN", "fldcn-primary");
    vi.stubEnv("FEISHU_JIGUANG_HR_EVALUATION_FOLDER_TOKEN", "fldcn-jiguang");

    expect(getFeishuEvaluationFolderToken("feishu")).toBe("fldcn-primary");
    expect(getFeishuEvaluationFolderToken("feishu-jiguang-hr")).toBe("fldcn-jiguang");
  });

  it("does not set a folder when the configuration is blank", () => {
    vi.stubEnv("FEISHU_EVALUATION_FOLDER_TOKEN", "  ");

    expect(getFeishuEvaluationFolderToken("feishu")).toBeUndefined();
  });
});

describe("isFeishuHumanInterviewEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled unless explicitly enabled", () => {
    expect(isFeishuHumanInterviewEnabled()).toBe(false);

    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "true");
    expect(isFeishuHumanInterviewEnabled()).toBe(true);
  });
});
