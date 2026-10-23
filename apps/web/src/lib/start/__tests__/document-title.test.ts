import { describe, expect, it } from "vitest";
import {
  ROOT_DOCUMENT_TITLE,
  documentTitleMeta,
  formatDocumentTitle,
  resolveDocumentTitle,
} from "../document-title";

describe("formatDocumentTitle", () => {
  it("appends the application name", () => {
    expect(formatDocumentTitle("登录")).toBe("登录 · Deepround");
  });

  it("does not append the application name twice", () => {
    expect(formatDocumentTitle(ROOT_DOCUMENT_TITLE)).toBe(ROOT_DOCUMENT_TITLE);
  });
});

describe("resolveDocumentTitle", () => {
  it.each([
    ["/", "Deepround"],
    ["/unknown-page", "Deepround"],
    ["/invite/invite-token", "加入工作区 · Deepround"],
    ["/interview/interview-id", "AI 面试 · Deepround"],
    ["/w/acme/agent", "招聘智能体 · Deepround"],
    ["/w/acme/agent/session-id", "招聘智能体 · 对话 · Deepround"],
    ["/w/acme/studio/dashboard", "Studio · Deepround"],
    ["/platform/organizations", "平台管理 · Deepround"],
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
    ).toEqual([{ title: "平台管理 · Deepround" }]);
  });
});
