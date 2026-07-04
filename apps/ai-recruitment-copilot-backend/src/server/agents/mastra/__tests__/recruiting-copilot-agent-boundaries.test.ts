import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../agents/recruiting-copilot-agent.ts", import.meta.url),
  "utf-8",
);

describe("RecruitingCopilotAgent product boundaries", () => {
  it("keeps workspace recruiting copilot constraints explicit", () => {
    expect(source).toContain("不要要求用户上传简历文件");
    expect(source).toContain("必须调用 propose_recruiting_action");
    expect(source).toContain("单次候选人对比最多 5 个");
    expect(source).toContain("必须明确说明引用了哪些候选人或岗位");
    expect(source).toContain("get_resume_record_detail");
  });
});
