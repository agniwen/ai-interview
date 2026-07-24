// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
} from "@/test-utils/react-act";
import { ResumeDuplicateMatchesDialog } from "../resume-dedup-overlay";

enableReactActEnvironment();
installNoopResizeObserver();

vi.mock("@/lib/client/workspace-context", () => ({
  useOptionalWorkspaceSlug: () => "default",
  useWorkspaceCan: () => false,
  useWorkspaceSlug: () => "default",
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/features/studio/studio-person-detail-dialog", () => ({
  StudioPersonDetailDialog: () => null,
}));

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

describe("ResumeDuplicateMatchesDialog", () => {
  it("shows uploader avatars and names for the current candidate and suspected records", async () => {
    const queryClient = new QueryClient();
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <ResumeDuplicateMatchesDialog
          matches={[
            {
              candidateEmail: "suspected@example.com",
              candidateName: "疑似候选人",
              candidatePhone: null,
              createdAt: "2026-07-24T00:00:00.000Z",
              id: "suspected-id",
              jobDescriptionName: null,
              status: "active",
              targetRole: null,
              uploaderImage: "https://example.com/suspected.png",
              uploaderName: "疑似上传人",
            },
          ]}
          onOpenChange={() => {}}
          open
          source={{
            candidateEmail: "current@example.com",
            candidateName: "当前候选人",
            candidatePhone: null,
            createdAt: "2026-07-24T00:00:00.000Z",
            id: "current-id",
            jobDescriptionName: null,
            resumeProfileSnapshot: null,
            skills: [],
            targetRole: null,
            uploaderImage: "https://example.com/current.png",
            uploaderName: "当前上传人",
          }}
        />
      </QueryClientProvider>,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("上传人");
    expect(document.body.textContent).toContain("当前上传人");
    expect(document.body.textContent).toContain("疑似上传人");
    const avatars = document.querySelectorAll<HTMLElement>('[data-slot="avatar"]');
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    for (const avatar of avatars) {
      expect(avatar.className).toContain("size-4");
      expect(avatar.dataset.size).toBe("default");
    }
  });
});
