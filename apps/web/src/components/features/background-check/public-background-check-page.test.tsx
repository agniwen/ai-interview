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
  it("uses confirmed calendar dates and clears the end date when switching employment status", async () => {
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
    expect(host.querySelector('input[type="date"]')).toBeNull();

    const today = new Date();
    const displayDate = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    for (const id of ["employment-start-0", "employment-end-0", "background-signed-date"]) {
      const trigger = host.querySelector<HTMLButtonElement>(`#${id}`);
      expect(trigger?.getAttribute("aria-required")).toBe("true");
      await act(() => trigger?.click());
      const day = document.querySelector<HTMLButtonElement>(
        `button[data-day="${today.toLocaleDateString()}"]`,
      );
      expect(day).not.toBeNull();
      await act(() => day?.click());
      expect(trigger?.textContent).toContain("选择日期");
      await act(() => {
        [...document.querySelectorAll<HTMLButtonElement>("button")]
          .find((button) => button.textContent === "确定")
          ?.click();
      });
      expect(trigger?.textContent).toContain(displayDate);
    }

    act(() => {
      if (status) {
        status.value = "no";
        status.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(host.querySelector("#employment-end-0")?.textContent).toBe("至今");
    expect(host.querySelector<HTMLSelectElement>("#employment-reason-0")?.disabled).toBe(true);
    act(() => {
      if (status) {
        status.value = "yes";
        status.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(host.querySelector("#employment-end-0")?.textContent).toBe("选择日期");
    expect(host.querySelector("#employment-start-0")?.textContent).toContain(displayDate);

    act(() => root.unmount());
    host.remove();
  });
});
