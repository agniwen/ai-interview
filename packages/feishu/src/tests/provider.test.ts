import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFeishuEvaluationFolderToken,
  getFeishuLoginProviderIds,
  getPreferredFeishuProviderId,
  isFeishuHumanInterviewEnabled,
  selectPreferredFeishuProviderId,
} from "../provider";

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

describe("Feishu provider policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults new flows and the only visible login entry to Jiguang HR", () => {
    expect(getPreferredFeishuProviderId()).toBe("feishu-jiguang-hr");
    expect(getFeishuLoginProviderIds()).toEqual(["feishu-jiguang-hr"]);
  });

  it("can restore the legacy login entry without disabling either provider", () => {
    vi.stubEnv("FEISHU_LEGACY_LOGIN_ENABLED", "true");

    expect(getFeishuLoginProviderIds()).toEqual(["feishu-jiguang-hr", "feishu"]);
    expect(selectPreferredFeishuProviderId(["feishu", "feishu-jiguang-hr"])).toBe(
      "feishu-jiguang-hr",
    );
  });

  it("falls back to the only provider actually bound to the user", () => {
    expect(selectPreferredFeishuProviderId(["feishu"])).toBe("feishu");
    expect(selectPreferredFeishuProviderId([])).toBeUndefined();
  });

  it("keeps a persisted provider ahead of the preference for historical resources", () => {
    expect(selectPreferredFeishuProviderId(["feishu", "feishu-jiguang-hr"], "feishu")).toBe(
      "feishu",
    );
  });

  it("honors an explicit preferred provider for new flows", () => {
    vi.stubEnv("FEISHU_PREFERRED_PROVIDER_ID", "feishu");

    expect(getPreferredFeishuProviderId()).toBe("feishu");
    expect(selectPreferredFeishuProviderId(["feishu", "feishu-jiguang-hr"])).toBe("feishu");
  });
});
