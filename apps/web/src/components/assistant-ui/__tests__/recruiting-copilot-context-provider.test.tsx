// @vitest-environment jsdom

import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { RecruitingActionProposal } from "@/lib/client/api";
import type { RecruitingCopilotContextProviderDependencies } from "../recruiting-copilot-context";

vi.stubEnv("DATABASE_URL", "postgres://unused:unused@localhost:5432/unused");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
vi.stubEnv("BETTER_AUTH_SECRET", "00000000000000000000000000000000");
vi.stubEnv("FEISHU_APP_ID", "test");
vi.stubEnv("FEISHU_APP_SECRET", "test");
vi.stubEnv("FEISHU_APP_ID2", "test");
vi.stubEnv("FEISHU_APP_SECRET2", "test");
vi.stubEnv("GOOGLE_CLIENT_ID", "test");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test");
vi.stubEnv("NEXT_PUBLIC_AGENT_NAME", "test");
vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN", "false");
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve(new Response("null", { headers: { "content-type": "application/json" } })),
  ),
);

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { WorkspaceSlugProvider } = await import("@/lib/client/workspace-context");
const { RecruitingCopilotContextProvider, useRecruitingCopilotContext } =
  await import("../recruiting-copilot-context");
const queryClient = new QueryClient();

// SAFETY: React 19 reads this documented test-environment flag from the global object.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface CommitSnapshot {
  citationIds: string[];
  conversationId: string | null;
  detailDialogMounted: boolean;
  detailDialogOpen: boolean;
  previewDialogOpen: boolean;
  proposalIds: string[];
  proposalStatuses: Record<string, string>;
}

const proposal: RecruitingActionProposal = {
  explanation: "把候选人用于当前岗位分析",
  id: "proposal-a",
  payload: { jobDescriptionId: "job-a", resumeRecordId: "resume-a" },
  title: "关联岗位",
  type: "bind_candidate_to_job",
};

const dependencies: RecruitingCopilotContextProviderDependencies = {
  ResumeDocumentPreviewDialog: ({ open }) => (
    <div data-open={String(open)} data-testid="resume-preview-dialog" />
  ),
  StudioPersonDetailDialog: ({ onOpenChange, onOpenChangeComplete, open }) => (
    <div data-open={String(open)} data-testid="resume-detail-dialog">
      <button
        aria-label="关闭候选人详情"
        data-testid="close-resume-detail"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <button
        aria-label="完成关闭候选人详情"
        data-testid="complete-resume-detail-close"
        onClick={() => onOpenChangeComplete?.(false)}
        type="button"
      />
    </div>
  ),
};

function ProviderProbe({ onLayoutCommit }: { onLayoutCommit: (snapshot: CommitSnapshot) => void }) {
  const context = useRecruitingCopilotContext();

  useLayoutEffect(() => {
    onLayoutCommit({
      citationIds: context.citations.map((citation) => citation.id),
      conversationId: context.conversationId,
      detailDialogMounted: Boolean(
        document.querySelector<HTMLElement>('[data-testid="resume-detail-dialog"]'),
      ),
      detailDialogOpen:
        document.querySelector<HTMLElement>('[data-testid="resume-detail-dialog"]')?.dataset
          .open === "true",
      previewDialogOpen:
        document.querySelector<HTMLElement>('[data-testid="resume-preview-dialog"]')?.dataset
          .open === "true",
      proposalIds: context.proposals.map((item) => item.id),
      proposalStatuses: context.proposalStatuses,
    });
  });

  return (
    <button
      onClick={() => {
        context.upsertCitations([
          {
            id: "resume-a",
            label: "候选人 A",
            recordType: "resume_record",
            secondaryLabel: null,
          },
        ]);
        context.upsertProposal(proposal);
        context.markProposal(proposal.id, "confirmed");
        context.openResumeDetail("resume-a");
        context.openResumePreview({ id: "resume-a", resumeFileName: "resume-a.pdf" });
      }}
      type="button"
    >
      填充会话状态
    </button>
  );
}

function TestProvider({
  conversationId,
  onLayoutCommit,
}: {
  conversationId: string;
  onLayoutCommit: (snapshot: CommitSnapshot) => void;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceSlugProvider id="workspace-a" memberRole="admin" permissions={{}} slug="acme">
        <RecruitingCopilotContextProvider
          conversationId={conversationId}
          dependencies={dependencies}
        >
          <ProviderProbe onLayoutCommit={onLayoutCommit} />
        </RecruitingCopilotContextProvider>
      </WorkspaceSlugProvider>
    </QueryClientProvider>
  );
}

describe("RecruitingCopilotContextProvider", () => {
  it("clears conversation-owned state before the first commit for a new conversation", async () => {
    const commits: CommitSnapshot[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestProvider
          conversationId="conversation-a"
          onLayoutCommit={(snapshot) => commits.push(snapshot)}
        />,
      );
      await Promise.resolve();
    });

    const fillState = container.querySelector<HTMLButtonElement>("button");
    await act(async () => {
      fillState?.click();
      await Promise.resolve();
    });

    expect(commits.at(-1)).toEqual(
      expect.objectContaining({
        citationIds: ["resume-a"],
        conversationId: "conversation-a",
        detailDialogMounted: true,
        detailDialogOpen: true,
        proposalIds: ["proposal-a"],
        proposalStatuses: { "proposal-a": "confirmed" },
      }),
    );
    expect(
      document.querySelector<HTMLElement>('[data-testid="resume-preview-dialog"]')?.dataset.open,
    ).toBe("true");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="close-resume-detail"]')?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="resume-detail-dialog"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-testid="resume-detail-dialog"]')?.dataset.open,
    ).toBe("false");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="complete-resume-detail-close"]')
        ?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="resume-detail-dialog"]')).toBeNull();

    await act(async () => {
      fillState?.click();
      await Promise.resolve();
    });

    commits.length = 0;
    await act(async () => {
      root.render(
        <TestProvider
          conversationId="conversation-b"
          onLayoutCommit={(snapshot) => commits.push(snapshot)}
        />,
      );
      await Promise.resolve();
    });

    expect(commits[0]).toEqual({
      citationIds: [],
      conversationId: "conversation-b",
      detailDialogMounted: false,
      detailDialogOpen: false,
      previewDialogOpen: false,
      proposalIds: [],
      proposalStatuses: {},
    });
    expect(container.querySelector("button")).toBe(fillState);

    act(() => root.unmount());
    container.remove();
  });
});
