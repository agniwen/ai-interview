import { describe, expect, it } from "vitest";
import {
  ROOT_DOCUMENT_TITLE,
  documentTitleMeta,
  formatDocumentTitle,
  resolveDocumentTitle,
} from "../document-title";

describe("formatDocumentTitle", () => {
  it("appends the application name", () => {
    expect(formatDocumentTitle("登录")).toBe("登录 · AInterviewer");
  });

  it("does not append the application name twice", () => {
    expect(formatDocumentTitle(ROOT_DOCUMENT_TITLE)).toBe(ROOT_DOCUMENT_TITLE);
  });
});

describe("resolveDocumentTitle", () => {
  it.each([
    ["/", "AInterviewer"],
    ["/unknown-page", "AInterviewer"],
    ["/invite/invite-token", "加入工作区 · AInterviewer"],
    ["/interview/interview-id", "AI 面试 · AInterviewer"],
    ["/w/acme/agent", "AInterviewer Agent"],
    ["/w/acme/agent/session-id", "对话 · AInterviewer Agent"],
    ["/w/acme/studio/dashboard", "Studio · AInterviewer"],
    ["/platform/organizations", "平台管理 · AInterviewer"],
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
    ).toEqual([{ title: "平台管理 · AInterviewer" }]);
  });
});
