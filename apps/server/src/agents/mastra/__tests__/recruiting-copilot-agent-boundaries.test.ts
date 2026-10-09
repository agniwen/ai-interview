import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../agents/recruiting-copilot-instructions.ts", import.meta.url),
  "utf-8",
);

describe("RecruitingCopilotAgent product boundaries", () => {
  it("keeps workspace recruiting copilot constraints explicit", () => {
    expect(source).toContain("不要要求用户上传简历文件");
    expect(source).toContain("用户明确同意绑定后");
    expect(source).toContain("不得写回 resumeReview");
    expect(source).toContain("单次候选人读取、评价或对比最多 5 个");
    expect(source).toContain("同一次 get_resume_record_detail.requests");
    expect(source).toContain("必须明确说明引用了哪些候选人或岗位");
    expect(source).toContain("get_resume_record_detail");
    expect(source).toContain("get_resume_pool_detail");
    expect(source).toContain("bind_candidate_to_job");
    expect(source).toContain("bind_pool_item_to_job");
    expect(source).toContain("人才库");
    expect(source).not.toContain("conversationJobBindingProposal");
  });
});
