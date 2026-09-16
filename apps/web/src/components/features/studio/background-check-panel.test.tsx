// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { BackgroundCheckCollectionRecord } from "@app/shared/studio-pipeline-stages";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { BackgroundCheckPanel } from "./background-check-panel";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

function renderPanel(status: BackgroundCheckCollectionRecord["status"], reviewed = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const collection: BackgroundCheckCollectionRecord = {
    createdAt: "2026-09-11T10:00:00Z",
    emailRecipient: status === "pending" ? null : "candidate@example.com",
    emailSentAt: status === "pending" ? null : "2026-09-11T10:00:00Z",
    formData: null,
    publicPath: "/background-check/test",
    status,
    submittedAt: status === "submitted" ? "2026-09-11T11:00:00Z" : null,
    updatedAt: "2026-09-11T11:00:00Z",
  };
  client.setQueryData(["background-check", "acme", "candidate"], collection);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <WorkspaceSlugProvider id="org" memberRole="hr" permissions={{}} slug="acme">
          <BackgroundCheckPanel
            candidateId="candidate"
            review={
              reviewed
                ? {
                    decidedAt: "2026-09-11T12:00:00Z",
                    reason: "核实通过",
                    result: "pass",
                    status: "completed",
                  }
                : undefined
            }
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    ),
  );
  return {
    cleanup: () => {
      act(() => root.unmount());
      client.clear();
      host.remove();
    },
    host,
  };
}

describe("background check panel stages", () => {
  it.each(["pending", "sent"] as const)("keeps collection actions in the %s stage", (status) => {
    const { host, cleanup } = renderPanel(status);
    try {
      expect(host.textContent).toContain("背调信息采集");
      expect(host.textContent).toContain(status === "sent" ? "已发送，待填写" : "待发送");
      expect(host.textContent).toContain("复制链接");
      expect(host.textContent).toContain("发送邮件");
      expect(host.textContent).not.toContain("采集记录");
    } finally {
      cleanup();
    }
  });

  it("shows the submitted result once without collection notices", () => {
    const { host, cleanup } = renderPanel("submitted", true);
    try {
      expect(host.querySelector('[data-slot="frame-panel-title"]')?.textContent).toBe("背景调查");
      expect(host.textContent?.match(/确认通过/g)).toHaveLength(1);
      expect(host.textContent).toContain("核实通过");
      expect(host.textContent).not.toContain("背景调查结果已确认");
      expect(host.textContent).not.toContain("复制链接");
      expect(host.textContent).not.toContain("发送邮件");
      expect(host.textContent).not.toContain("candidate@example.com");
      expect(host.textContent).not.toContain("采集记录");
      expect(host.textContent).not.toContain("发送时间");
    } finally {
      cleanup();
    }
  });

  it("keeps a pending confirmation visible after submission", () => {
    const { host, cleanup } = renderPanel("submitted");
    try {
      expect(host.textContent).toContain("确认结果待确认");
      expect(host.textContent).not.toContain("确认通过");
      expect(host.querySelector('[data-slot="frame-panel-title"]')?.textContent).toBe("背景调查");
    } finally {
      cleanup();
    }
  });
});
