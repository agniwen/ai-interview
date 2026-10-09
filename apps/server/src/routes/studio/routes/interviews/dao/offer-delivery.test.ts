import { describe, expect, it } from "vitest";
import { composeOfferEmailPreview, hasValidOfferLink, renderEmailContent } from "./offer-delivery";

describe("composeOfferEmailPreview", () => {
  it("uses the configured company and Offer position in the email subject", () => {
    const preview = composeOfferEmailPreview({
      candidateEmail: "candidate@example.com",
      candidateName: "任杨帆",
      companyName: " light公司 ",
      offerPosition: "前端高级工程师",
      offerUrl: "https://example.com/offer/token",
      organizationName: "light测试区",
    });

    expect(preview.subject).toBe("【light公司】Offer 通知｜前端高级工程师");
    expect(preview.to).toBe("candidate@example.com");
    expect(preview.content).toContain("诚挚邀请您加入 light公司");
    expect(preview.offerUrl).toBe("https://example.com/offer/token");
  });

  it("falls back to the workspace name when company name is blank", () => {
    const preview = composeOfferEmailPreview({
      candidateEmail: null,
      candidateName: "候选人",
      companyName: "",
      offerPosition: "高级前端工程师",
      offerUrl: "https://example.com/offer/token",
      organizationName: "示例公司",
    });

    expect(preview.subject).toBe("【示例公司】Offer 通知｜高级前端工程师");
    expect(preview.to).toBe("");
  });
});

describe("renderEmailContent", () => {
  it("keeps the sent text identical to the editable body", () => {
    const offerUrl = "https://example.com/offer/token";
    const content = "请在有效期内确认。";
    const rendered = renderEmailContent(content, offerUrl);

    expect(rendered.text).toBe(content);
    expect(rendered.text).not.toContain("确认 Offer：");
  });
});

describe("hasValidOfferLink", () => {
  const offerUrl = "https://example.com/offer/current-token";

  it("accepts exactly one current Offer link", () => {
    expect(hasValidOfferLink(`请打开：${offerUrl}`, offerUrl)).toBe(true);
  });

  it.each([
    ["missing", "邮件正文没有链接"],
    ["modified", "请打开：https://example.com/offer/changed-token"],
    ["duplicate", `${offerUrl}\n${offerUrl}`],
    ["mixed", `${offerUrl}\nhttps://example.com/offer/old-token`],
  ])("rejects %s Offer links", (_name, content) => {
    expect(hasValidOfferLink(content, offerUrl)).toBe(false);
  });
});
