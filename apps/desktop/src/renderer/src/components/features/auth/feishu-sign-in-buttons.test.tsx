import { describe, expect, it } from "vitest";
import { buildFeishuLoginButtonOptions, isFeishuMigrationEnabled } from "./feishu-sign-in-buttons";

describe("Feishu login policy", () => {
  it("keeps migration closed when legacy login is disabled", () => {
    expect(isFeishuMigrationEnabled(["feishu-jiguang-hr"])).toBe(false);
    expect(isFeishuMigrationEnabled([])).toBe(false);
  });

  it("allows migration only when legacy login is enabled", () => {
    expect(isFeishuMigrationEnabled(["feishu-jiguang-hr", "feishu"])).toBe(true);
  });

  it("keeps the legacy app hidden unless it is returned by server policy", () => {
    const options = buildFeishuLoginButtonOptions(["feishu-jiguang-hr"]);
    expect(options.map((item) => item.providerId)).toEqual(["feishu-jiguang-hr"]);
    expect(options[0]?.variant).toBe("default");
  });

  it("can restore both login entries", () => {
    const options = buildFeishuLoginButtonOptions(["feishu-jiguang-hr", "feishu"]);
    expect(options.map((item) => item.providerId)).toEqual(["feishu-jiguang-hr", "feishu"]);
  });
});
