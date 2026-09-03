import { describe, expect, it } from "vitest";
import {
  ROOT_DOCUMENT_TITLE,
  documentTitleMeta,
  formatDocumentTitle,
  resolveDocumentTitle,
} from "../document-title";

describe("formatDocumentTitle", () => {
  it("appends the application name", () => {
    expect(formatDocumentTitle("登录")).toBe("登录 · AI Hiring Copilot");
  });

  it("does not append the application name twice", () => {
    expect(formatDocumentTitle(ROOT_DOCUMENT_TITLE)).toBe(ROOT_DOCUMENT_TITLE);
  });
});

describe("resolveDocumentTitle", () => {
  it.each([
    ["/", ROOT_DOCUMENT_TITLE],
    ["/invite/invite-token", "加入工作区 · AI Hiring Copilot"],
    ["/interview/interview-id", "AI 面试 · AI Hiring Copilot"],
    ["/w/acme/agent", "招聘 Copilot · AI Hiring Copilot"],
    ["/w/acme/agent/session-id", "招聘 Copilot · 对话 · AI Hiring Copilot"],
    ["/w/acme/studio/dashboard", "Studio · AI Hiring Copilot"],
    ["/platform/organizations", "平台管理 · AI Hiring Copilot"],
  ])("resolves %s", (pathname, expectedTitle) => {
    expect(resolveDocumentTitle(pathname)).toBe(expectedTitle);
  });

  it("uses the final route match for inherited layout titles", () => {
    expect(
      documentTitleMeta([
        { pathname: "/" },
        { pathname: "/platform" },
        { pathname: "/platform/organizations" },
      ]),
    ).toEqual([{ title: "平台管理 · AI Hiring Copilot" }]);
  });
});
