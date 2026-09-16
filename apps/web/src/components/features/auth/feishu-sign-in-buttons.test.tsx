import { describe, expect, it } from "vitest";
import { buildFeishuLoginButtonOptions, isFeishuMigrationEnabled } from "./feishu-sign-in-buttons";

describe("Feishu login policy", () => {
  it("keeps migration closed when the legacy login policy is disabled", () => {
    expect(isFeishuMigrationEnabled(["feishu-jiguang-hr"])).toBe(false);
    expect(isFeishuMigrationEnabled([])).toBe(false);
  });

  it("allows migration only when legacy login is explicitly enabled", () => {
    expect(isFeishuMigrationEnabled(["feishu-jiguang-hr", "feishu"])).toBe(true);
  });

  it("renders only the Jiguang HR entry for the default server policy", () => {
    const options = buildFeishuLoginButtonOptions(["feishu-jiguang-hr"]);
    expect(options.map((item) => item.providerId)).toEqual(["feishu-jiguang-hr"]);
    expect(options[0]?.variant).toBe("default");
  });

  it("renders the legacy entry when the server explicitly includes it", () => {
    const options = buildFeishuLoginButtonOptions(["feishu-jiguang-hr", "feishu"]);
    expect(options.map((item) => item.providerId)).toEqual(["feishu-jiguang-hr", "feishu"]);
  });
});
