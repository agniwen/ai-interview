// 中文：OAuth 绑定卡片的 JSX 快照测试
// English: JSX snapshot for the OAuth binding card
import { describe, expect, it } from "vitest";
import { OAuthBindingCard } from "../cards/oauth-binding-card";

describe("OAuthBindingCard", () => {
  it("renders title and a single auth button", () => {
    const card = OAuthBindingCard({ appUrl: "https://example.com" });
    expect(card).toBeDefined();
    const json = JSON.stringify(card);
    expect(json).toContain("首次使用");
    expect(json).toContain("https://example.com/login");
    expect(json).toContain("return_to=feishu-success");
  });
});
