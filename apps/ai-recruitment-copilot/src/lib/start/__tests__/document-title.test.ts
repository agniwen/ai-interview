import { describe, expect, it } from "vitest";
import {
  ROOT_DOCUMENT_TITLE,
  documentTitleMeta,
  formatDocumentTitle,
  resolveDocumentTitle,
} from "../document-title";

describe("formatDocumentTitle", () => {
  it("appends the application name", () => {
    expect(formatDocumentTitle("登录")).toBe("登录 · AI Recruitment Copilot");
  });

  it("does not append the application name twice", () => {
    expect(formatDocumentTitle(ROOT_DOCUMENT_TITLE)).toBe(ROOT_DOCUMENT_TITLE);
  });
});

describe("resolveDocumentTitle", () => {
  it.each([
    ["/", ROOT_DOCUMENT_TITLE],
    ["/invite/invite-token", "加入工作区 · AI Recruitment Copilot"],
    ["/interview/interview-id", "AI 面试 · AI Recruitment Copilot"],
    ["/w/acme/agent", "招聘 Copilot · AI Recruitment Copilot"],
    ["/w/acme/agent/session-id", "招聘 Copilot · 对话 · AI Recruitment Copilot"],
    ["/w/acme/studio/dashboard", "Studio · AI Recruitment Copilot"],
    ["/platform/organizations", "平台管理 · AI Recruitment Copilot"],
    ["/platform/mastra-studio/workflows", "Workflows · Mastra Studio · AI Recruitment Copilot"],
    [
      "/platform/mastra-studio/workflows/workflow-id/graph/run-id",
      "Workflow Graph · Mastra Studio · AI Recruitment Copilot",
    ],
    [
      "/platform/mastra-studio/agent-builder/skills/create",
      "Create · Skills · Agent Builder · Mastra Studio · AI Recruitment Copilot",
    ],
    [
      "/platform/mastra-studio/cms/agents/agent-id/edit/instruction-blocks",
      "Edit · Instruction Blocks · Mastra Studio · AI Recruitment Copilot",
    ],
    [
      "/platform/mastra-studio/datasets/dataset-id/items/item-id/versions",
      "Versions · Mastra Studio · AI Recruitment Copilot",
    ],
    [
      "/platform/mastra-studio/agents/agent-id/session/thread-id",
      "Agent Session · Mastra Studio · AI Recruitment Copilot",
    ],
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
    ).toEqual([{ title: "Datasets · Mastra Studio · AI Recruitment Copilot" }]);
  });
});
