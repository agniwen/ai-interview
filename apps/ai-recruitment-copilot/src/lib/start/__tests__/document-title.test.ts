import { describe, expect, it } from "vitest";
import { ROOT_DOCUMENT_TITLE, documentTitleMeta, resolveDocumentTitle } from "../document-title";

describe("resolveDocumentTitle", () => {
  it.each([
    ["/", ROOT_DOCUMENT_TITLE],
    ["/invite/invite-token", "加入工作区"],
    ["/interview/interview-id", "AI 面试"],
    ["/w/acme/agent", "招聘 Copilot"],
    ["/w/acme/agent/session-id", "招聘 Copilot · 对话"],
    ["/w/acme/studio/dashboard", "Studio"],
    ["/platform/organizations", "平台管理"],
    ["/platform/mastra-studio/workflows", "Workflows · Mastra Studio"],
    [
      "/platform/mastra-studio/workflows/workflow-id/graph/run-id",
      "Workflow Graph · Mastra Studio",
    ],
    [
      "/platform/mastra-studio/agent-builder/skills/create",
      "Create · Skills · Agent Builder · Mastra Studio",
    ],
    [
      "/platform/mastra-studio/cms/agents/agent-id/edit/instruction-blocks",
      "Edit · Instruction Blocks · Mastra Studio",
    ],
    [
      "/platform/mastra-studio/datasets/dataset-id/items/item-id/versions",
      "Versions · Mastra Studio",
    ],
    ["/platform/mastra-studio/agents/agent-id/session/thread-id", "Agent Session · Mastra Studio"],
  ])("resolves %s", (pathname, expectedTitle) => {
    expect(resolveDocumentTitle(pathname)).toBe(expectedTitle);
  });

  it("uses the final route match for inherited layout titles", () => {
    expect(
      documentTitleMeta([
        { pathname: "/" },
        { pathname: "/platform" },
        { pathname: "/platform/mastra-studio/datasets" },
      ]),
    ).toEqual([{ title: "Datasets · Mastra Studio" }]);
  });
});
