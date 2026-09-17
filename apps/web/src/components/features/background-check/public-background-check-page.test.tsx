// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicBackgroundCheckRecord } from "@app/shared/studio-pipeline-stages";
import { backgroundCheckDraftInputSchema } from "@app/db-schema/background-check";
import type { savePublicBackgroundCheckDraft } from "@/lib/client/api/endpoints/background-check";
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

function expectRequiredLabel(host: HTMLElement, id: string, required = true) {
  const mark = host.querySelector(`label[for="${id}"] .text-destructive`);
  expect(mark?.textContent ?? null).toBe(required ? "*" : null);
}

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
    for (const id of [
      "background-name",
      "background-gender",
      "background-id",
      "background-graduation",
      "employment-company-0",
      "employment-position-0",
      "employment-left-0",
      "employment-start-0",
      "disciplinary-record-0",
      "employment-0-hr-name",
      "employment-0-hr-contact",
      "employment-0-manager-name",
      "employment-0-manager-contact",
      "employment-0-colleague-name",
      "employment-0-colleague-contact",
      "contact-permission-0",
      "background-signature",
      "background-signed-date",
    ]) {
      expectRequiredLabel(host, id);
    }
    expectRequiredLabel(host, "employment-reason-0", false);
    expectRequiredLabel(host, "employment-end-0", false);
    expect(host.querySelector('[role="checkbox"]')?.getAttribute("aria-required")).toBe("true");

    act(() => {
      if (status) {
        status.value = "yes";
        status.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(host.querySelector<HTMLSelectElement>("#employment-reason-0")?.disabled).toBe(false);
    expectRequiredLabel(host, "employment-reason-0");
    expectRequiredLabel(host, "employment-end-0");
    act(() => {
      if (reason) {
        reason.value = "other";
        reason.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expectRequiredLabel(host, "employment-reason-other-0");
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
    expectRequiredLabel(host, "employment-reason-0", false);
    expectRequiredLabel(host, "employment-end-0", false);
    expect(host.querySelector("#employment-reason-other-0")).toBeNull();
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

  it("saves an incomplete form and restores it through the initial record without restoring authorization", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const saveDraft = vi
      .fn<typeof savePublicBackgroundCheckDraft>()
      .mockResolvedValue({ savedAt: "2026-09-16T09:00:00.000Z" });
    const dependencies = { saveDraft };
    act(() =>
      root.render(
        <PublicBackgroundCheckPage
          dependencies={dependencies}
          initialRecord={record}
          token="draft-token"
        />,
      ),
    );
    const copyConsent = host.querySelector<HTMLButtonElement>('[role="checkbox"]');
    await act(() => copyConsent?.click());
    const saveButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "保存草稿",
    );
    expect(saveButton?.type).toBe("button");
    await act(() => saveButton?.click());
    expect(saveDraft).toHaveBeenCalledTimes(1);
    const [token, savedInput] = saveDraft.mock.calls[0] ?? [];
    expect(token).toBe("draft-token");
    const parsedDraft = backgroundCheckDraftInputSchema.parse(savedInput);
    expect(parsedDraft.candidateName).toBe(record.candidateName);
    expect(parsedDraft.employmentRecords[0]?.companyName).toBe("");
    expect(savedInput).not.toHaveProperty("consent");
    expect(host.textContent).toContain(" · 已保存");
    expect(host.textContent).not.toContain("背景调查信息已提交");
    act(() =>
      root.render(
        <PublicBackgroundCheckPage
          dependencies={dependencies}
          initialRecord={{
            ...record,
            draftData: { ...parsedDraft, gender: "female", idNumber: "123456" },
            draftSavedAt: "2026-09-16T09:00:00.000Z",
          }}
          key="reopened"
          token="draft-token"
        />,
      ),
    );
    expect(host.querySelector<HTMLInputElement>("#background-id")?.value).toBe("123456");
    expect(host.querySelector<HTMLSelectElement>("#background-gender")?.value).toBe("female");
    expect(host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe("false");
    const gender = host.querySelector<HTMLSelectElement>("#background-gender");
    act(() => {
      if (gender) {
        gender.value = "male";
        gender.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(host.textContent).toContain("有修改尚未保存");
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "确认并提交",
      )?.disabled,
    ).toBe(true);
    act(() => root.unmount());
  });

  it("keeps the form editable and shows an error when saving fails", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const saveDraft = vi.fn().mockRejectedValue(new Error("网络连接失败"));
    act(() =>
      root.render(
        <PublicBackgroundCheckPage
          dependencies={{ saveDraft }}
          initialRecord={record}
          token="token"
        />,
      ),
    );
    const saveButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "保存草稿",
    );
    await act(() => saveButton?.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("网络连接失败");
    expect(host.querySelector<HTMLInputElement>("#background-name")?.value).toBe(
      record.candidateName,
    );
    expect(saveButton?.disabled).toBe(false);
    expect(host.textContent).not.toContain("草稿保存于");
    act(() => root.unmount());
  });

  it("does not expose draft saving after formal submission", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const saveDraft = vi.fn<typeof savePublicBackgroundCheckDraft>();
    act(() =>
      root.render(
        <PublicBackgroundCheckPage
          dependencies={{ saveDraft }}
          initialRecord={{ ...record, status: "submitted" }}
          token="token"
        />,
      ),
    );
    expect(host.textContent).toContain("背景调查信息已提交");
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("保存草稿");
    expect(saveDraft).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
