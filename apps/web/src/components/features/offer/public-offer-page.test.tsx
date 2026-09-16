// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { PublicOfferPage } from "./public-offer-page";
import type { PublicOfferRecord } from "@app/shared/studio-pipeline-stages";
// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const offer: PublicOfferRecord = {
  baseSalary: 28_000,
  bonus: null,
  candidateName: "候选人",
  companyName: "公司",
  currency: "CNY",
  declineReason: null,
  equity: null,
  expiresAt: "2026-09-16T15:59:59.999Z",
  joiningDate: null,
  position: "工程师",
  publishedAt: "2026-09-16T00:00:00Z",
  responseAt: null,
  status: "sent",
};
describe("Offer 公开页面", () => {
  it.each(["sent", "superseded"] as const)("%s 展示截止日期并正确控制响应入口", (status) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<PublicOfferPage initialOffer={{ ...offer, status }} token="test" />));
      expect(host.textContent).toContain("2026年9月16日");
      expect(host.textContent).toContain("北京时间，含当天");
      const buttons = [...host.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      );
      if (status === "superseded") {
        expect(host.textContent).toContain("当前 Offer 已失效");
        expect(buttons).not.toContain("接受 Offer");
        expect(buttons).not.toContain("拒绝 Offer");
      } else {
        expect(buttons).toContain("接受 Offer");
      }
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
