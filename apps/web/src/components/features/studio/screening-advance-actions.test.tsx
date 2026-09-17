// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import type { WorkspacePermissionStatements } from "@app/shared/permission-statements";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { ScreeningAdvanceActions } from "./screening-advance-actions";

const defaultPermissions: WorkspacePermissionStatements = {
  humanInterview: ["create"],
  interview: ["create"],
  resumeLibrary: ["update"],
};

function renderActions(
  status: ResumeLibraryDetail["resumeEvaluationStatus"],
  permissions: WorkspacePermissionStatements = defaultPermissions,
  pipelineStage: ResumeLibraryDetail["pipelineStage"] = "screening",
) {
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider
        id="workspace"
        slug="default"
        memberRole="member"
        permissions={permissions}
      >
        <ScreeningAdvanceActions
          record={{ id: "record", pipelineStage, resumeEvaluationStatus: status, version: 1 }}
        />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
  client.clear();
  return html;
}

describe("screening detail advance actions", () => {
  it.each([null, "pass"] as const)("shows both target actions for %s", (status) => {
    const html = renderActions(status);
    expect(html).toContain("推进 AI 初面");
    expect(html).toContain("直接安排复试");
  });
  it("does not offer advancement for rejected or non-screening records", () => {
    expect(renderActions("fail")).toBe("");
    expect(renderActions("pass", undefined, "ai_interview")).toBe("");
  });
  it("requires resume update and the permission for each target", () => {
    expect(renderActions(null, { humanInterview: ["create"], interview: ["create"] })).toBe("");
    const html = renderActions(null, { interview: ["create"], resumeLibrary: ["update"] });
    expect(html).toContain("推进 AI 初面");
    expect(html).not.toContain("直接安排复试");
  });
});
