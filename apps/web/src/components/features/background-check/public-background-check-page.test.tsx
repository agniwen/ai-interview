// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicBackgroundCheckRecord } from "@app/shared/studio-pipeline-stages";
import { PublicBackgroundCheckPage } from "./public-background-check-page";

// SAFETY: React exposes this test-only global flag without adding it to the runtime type.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

const record: PublicBackgroundCheckRecord = {
  candidateName: "任杨帆",
  companyName: "light公司",
  jobName: "前端技术经理",
  status: "sent",
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("PublicBackgroundCheckPage", () => {
  it("keeps the original collection fields and presents employment as a period", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(<PublicBackgroundCheckPage initialRecord={record} token="token" />));

    expect(host.textContent).toContain("填写说明");
    expect(host.textContent).toContain("在职时间");
    expect(host.textContent).toContain("开始时间");
    expect(host.textContent).toContain("结束时间");
    expect(host.textContent).toContain("离职原因");
    expect(host.textContent).toContain("违纪记录");
    expect(host.textContent).toContain("人力部门联系人");
    expect(host.textContent).toContain("直接主管");
    expect(host.textContent).toContain("同事联系人");
    expect(host.textContent).toContain("本人签名");
    expect(host.textContent).toContain("签署日期");

    const status = host.querySelector<HTMLSelectElement>("#employment-left-0");
    const reason = host.querySelector<HTMLSelectElement>("#employment-reason-0");
    const permission = host.querySelector<HTMLSelectElement>("#contact-permission-0");
    expect(status?.value).toBe("");
    expect(reason?.disabled).toBe(true);
    expect(permission?.value).toBe("");

    act(() => {
      if (status) {
        status.value = "yes";
        status.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(host.querySelector<HTMLSelectElement>("#employment-reason-0")?.disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>("#employment-end-0")?.type).toBe("date");

    act(() => root.unmount());
    host.remove();
  });
});
