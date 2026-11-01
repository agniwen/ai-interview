// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { OfferStagePanel } from "./offer-stage-panel";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = vi
  .fn()
  .mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() });

describe("Offer stage content", () => {
  it.each([
    ["income_proof", false, false],
    ["salary_negotiation", true, false],
    ["offer", true, true],
    ["background_check", true, true],
  ] as const)("%s displays cumulative stage content", (stage, expectations, settings) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(
      ["recruiting-materials", "acme", "candidate"],
      [
        {
          contentType: "application/pdf",
          createdAt: "2026-09-08T00:00:00Z",
          fileName: "流水.pdf",
          id: "file-1",
          sizeBytes: 1024,
        },
      ],
    );
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    queryClient.setQueryData(["offer-drafts", "acme", "candidate"], []);
    queryClient.setQueryData(["background-check", "acme", "candidate"], null);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage={stage}
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                nodeStates={[
                  {
                    completedAt: stage === "income_proof" ? null : "2026-09-09T01:00:00Z",
                    decidedAt: stage === "income_proof" ? null : "2026-09-09T01:00:00Z",
                    decidedBy: stage === "income_proof" ? null : "hr",
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: "2026-09-09T00:00:00Z",
                    node: "income_proof",
                    reason: stage === "income_proof" ? null : "流水真实有效",
                    result: stage === "income_proof" ? null : "pass",
                    status: stage === "income_proof" ? "pending" : "completed",
                  },
                ]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("流水文件");
      expect(host.textContent).toContain("Offer 协商进度");
      expect(host.textContent).toContain("流水提供");
      expect(host.textContent).toContain("谈薪");
      expect(host.textContent).toContain("发 Offer");
      expect(host.textContent).toContain("背调");
      expect(host.querySelector('[aria-current="step"]')?.textContent).toContain(
        {
          background_check: "背调",
          income_proof: "流水提供",
          offer: "发 Offer",
          salary_negotiation: "谈薪",
        }[stage],
      );
      expect(host.textContent?.includes("候选人期望")).toBe(expectations);
      expect(host.textContent?.includes("Offer 内容")).toBe(settings);
      expect(host.textContent).not.toContain("版本");
      const createButton = [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("创建 Offer"),
      );
      expect(Boolean(createButton)).toBe(stage === "offer");
      expect(Boolean(host.querySelector('[aria-label="上传附件"]'))).toBe(stage === "income_proof");
      expect(Boolean(host.querySelector('[aria-label="删除 流水.pdf"]'))).toBe(
        stage === "income_proof",
      );
      expect(host.textContent?.includes("背调信息采集")).toBe(stage === "background_check");
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "复制链接"),
      ).toBe(stage === "background_check");
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "发送邮件"),
      ).toBe(stage === "background_check");
      expect(host.querySelector("a[download]")).not.toBeNull();
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "编辑"),
      ).toBe(stage === "salary_negotiation");
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("explains the first Offer negotiation task and its no-material fallback", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage="income_proof"
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                nodeStates={[]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("当前阶段：收集并核验候选人的薪资证明");
      expect(host.textContent).toContain("上传材料后点击“确认流水审核结果”");
      expect(host.textContent).toContain("未提供材料时，请在审核说明中记录原因");
      expect(host.querySelector('[aria-label="流水文件"]')?.textContent).not.toContain("当前操作");
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("updates the Offer stage guidance after the candidate accepts", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    queryClient.setQueryData(
      ["offer-drafts", "acme", "candidate"],
      [
        {
          baseSalary: 40_000,
          bonus: null,
          candidateCounter: null,
          contentRevision: 1,
          createdAt: "2026-09-20T00:00:00Z",
          currency: "CNY",
          currentApprovalId: null,
          declineReason: null,
          emailRecipient: "candidate@example.com",
          emailSentAt: "2026-09-20T00:00:00Z",
          equity: null,
          expiresAt: "2026-09-27T00:00:00Z",
          id: "accepted-offer",
          interviewRecordId: "candidate",
          joiningDate: "2026-10-01T00:00:00Z",
          notes: null,
          organizationId: "org",
          position: "前端高级工程师",
          publicPath: "/offer/token",
          publishedAt: "2026-09-20T00:00:00Z",
          publishedBy: "hr",
          responseAt: "2026-09-20T01:00:00Z",
          responseBy: null,
          responseSource: "candidate",
          sentAt: "2026-09-20T00:00:00Z",
          status: "accepted",
          updatedAt: "2026-09-20T01:00:00Z",
          version: 1,
        },
      ],
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage="offer"
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail="candidate@example.com"
                nodeStates={[]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("当前阶段：候选人已接受 Offer，可进入背调。");
      expect(host.textContent).not.toContain("待候选人接受后可进入背调");
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("keeps explaining the current stage after a historical node result exists", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage="income_proof"
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                nodeStates={[
                  {
                    completedAt: "2026-09-09T01:00:00Z",
                    decidedAt: "2026-09-09T01:00:00Z",
                    decidedBy: "hr",
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: "2026-09-09T00:00:00Z",
                    node: "income_proof",
                    reason: "流水真实有效",
                    result: "pass",
                    status: "completed",
                  },
                ]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("当前阶段：收集并核验候选人的薪资证明");
      expect(host.textContent).toContain("上传材料后点击“确认流水审核结果”");
      expect(host.textContent).toContain("审核通过");
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("only marks Offer negotiation steps completed from their persisted node state", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    queryClient.setQueryData(["offer-drafts", "acme", "candidate"], []);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage="offer"
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                nodeStates={[
                  {
                    completedAt: "2026-09-09T01:00:00Z",
                    decidedAt: "2026-09-09T01:00:00Z",
                    decidedBy: "hr",
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: "2026-09-09T00:00:00Z",
                    node: "income_proof",
                    reason: "流水真实有效",
                    result: "pass",
                    status: "completed",
                  },
                  {
                    completedAt: null,
                    decidedAt: null,
                    decidedBy: null,
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: null,
                    node: "salary_negotiation",
                    reason: null,
                    result: null,
                    status: "skipped",
                  },
                ]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.querySelectorAll("svg.tabler-icon-check")).toHaveLength(1);
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("shows the agreed salary and prefills it when creating an Offer", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: { agreedBaseSalary: 28_000 },
    });
    queryClient.setQueryData(["offer-drafts", "acme", "candidate"], []);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                agreedBaseSalary={28_000}
                stage="offer"
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                nodeStates={[]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain("转正工资¥ 28,000");
      const create = [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("创建 Offer"),
      );
      expect(create).toBeDefined();
      await act(() => create?.click());
      expect(document.querySelector<HTMLInputElement>("#offer-base")?.value).toBe("28000");
    } finally {
      await act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it.each([
    ["pass", "审核通过", "流水真实有效"],
    ["fail", "已驳回", "流水信息不完整"],
  ] as const)("keeps the income proof %s result visible", (result, label, reason) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage={result === "pass" ? "salary_negotiation" : "income_proof"}
                candidateId="candidate"
                candidateName="候选人"
                candidateEmail={null}
                disabled={result === "fail"}
                nodeStates={[
                  {
                    completedAt: "2026-09-09T01:00:00Z",
                    decidedAt: "2026-09-09T01:00:00Z",
                    decidedBy: "hr",
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: "2026-09-09T00:00:00Z",
                    node: "income_proof",
                    reason,
                    result,
                    status: "completed",
                  },
                ]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.textContent).toContain(label);
      expect(host.textContent).toContain(`审核说明：${reason}`);
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });

  it("keeps the confirmed background check result in the Offer module after entering onboarding", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
    queryClient.setQueryData(["studio-resumes", "acme", "detail", "candidate"], {
      candidateExpectationsMeta: null,
    });
    queryClient.setQueryData(["offer-drafts", "acme", "candidate"], []);
    queryClient.setQueryData(["background-check", "acme", "candidate"], {
      createdAt: "2026-09-11T06:00:00.000Z",
      emailRecipient: "candidate@example.com",
      emailSentAt: "2026-09-11T06:10:00.000Z",
      formData: {
        candidateName: "任杨帆",
        consent: true,
        employmentRecords: [],
        gender: "male",
        graduationCertificateNumber: "CERT-1",
        idNumber: "ID-123456",
        signatureName: "任杨帆",
        signedDate: "2026-09-11",
      },
      publicPath: "/background-check/token",
      status: "submitted",
      submittedAt: "2026-09-11T07:00:00.000Z",
      updatedAt: "2026-09-11T07:00:00.000Z",
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <QueryClientProvider client={queryClient}>
            <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
              <OfferStagePanel
                stage="onboarding"
                candidateId="candidate"
                candidateName="任杨帆"
                candidateEmail="candidate@example.com"
                nodeStates={[
                  {
                    completedAt: "2026-09-11T08:39:58.498Z",
                    decidedAt: "2026-09-11T08:39:58.498Z",
                    decidedBy: "hr-user",
                    effectiveAiRoundId: null,
                    effectiveHumanRoundId: null,
                    effectiveOfferId: null,
                    enteredAt: "2026-09-11T06:00:00.000Z",
                    node: "background_check",
                    reason: "合格",
                    result: "pass",
                    status: "completed",
                  },
                ]}
              />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        ),
      );
      expect(host.querySelector('[aria-label="背调结果"]')).not.toBeNull();
      expect(host.textContent).toContain("确认通过");
      expect(host.textContent).toContain("确认说明：合格");
      expect(host.textContent).toContain("确认时间");
      expect(host.textContent).not.toContain("已提交，待确认结果");
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "复制链接"),
      ).toBe(false);
      expect(
        [...host.querySelectorAll("button")].some((button) => button.textContent === "发送邮件"),
      ).toBe(false);
    } finally {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    }
  });
});

it("回退后的历史 Offer 不阻止新建，也不再提供发送或响应操作", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(["recruiting-materials", "acme", "candidate"], []);
  queryClient.setQueryData(["candidate-expectations", "acme", "candidate"], null);
  queryClient.setQueryData(
    ["offer-drafts", "acme", "candidate"],
    [
      {
        baseSalary: 28_000,
        bonus: null,
        candidateCounter: null,
        createdAt: "2026-09-16T00:00:00Z",
        currency: "CNY",
        declineReason: null,
        emailRecipient: null,
        emailSentAt: null,
        equity: null,
        expiresAt: null,
        id: "old",
        interviewRecordId: "candidate",
        joiningDate: null,
        notes: null,
        organizationId: "org",
        position: "旧版工程师",
        publicPath: "/offer/old-token",
        publishedAt: "2026-09-16T00:00:00Z",
        responseAt: null,
        responseSource: null,
        sentAt: "2026-09-16T00:00:00Z",
        status: "superseded",
        updatedAt: "2026-09-16T00:00:00Z",
        version: 1,
      },
    ],
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceSlugProvider id="org" slug="acme" memberRole="hr" permissions={{}}>
            <OfferStagePanel
              stage="offer"
              candidateId="candidate"
              candidateName="候选人"
              candidateEmail={null}
              nodeStates={[]}
            />
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      ),
    );
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "创建 Offer",
      ),
    ).toBe(true);
    expect(host.textContent).toContain("历史 Offer（1）");
    expect(host.textContent).toContain("旧版工程师");
    expect(host.textContent).not.toContain("复制 Offer 链接");
    expect(host.textContent).not.toContain("记录响应");
    expect(host.textContent).not.toContain("重新发送邮件");
  } finally {
    act(() => root.unmount());
    queryClient.clear();
    host.remove();
  }
});
