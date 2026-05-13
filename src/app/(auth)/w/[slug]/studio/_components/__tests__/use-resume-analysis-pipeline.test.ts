// Node 环境测试，锁定 useResumeAnalysisPipeline 的回调契约（红阶段）。
// 钩子尚未实现；调用时会直接 throw，导致测试失败。
// Task 4 实现钩子后，这些测试将转绿。
//
// Node-env tests pin the useResumeAnalysisPipeline callback contract (red stage).
// The hook is a stub that throws on call; tests attempt to exercise the pipeline
// and fail because the hook is not yet implemented. Task 4 makes them pass.

import { describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@/lib/shared/interview/types";
import { useResumeAnalysisPipeline } from "../use-resume-analysis-pipeline";

// SAMPLE_PROFILE 包含 resumeProfileSchema 的所有必填字段。
// All required fields from resumeProfileSchema are populated here.
const SAMPLE_PROFILE: ResumeProfile = {
  age: null,
  email: null,
  gender: "未发现信息",
  name: "Alice",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: ["软件工程师"],
  workExperiences: [],
  workYears: null,
};

const FILE = new File(["%PDF-1.4"], "alice.pdf", { type: "application/pdf" });

const QUESTIONS = [{ difficulty: "easy" as const, order: 1, question: "Tell me about yourself" }];

// 用于占位的 options 对象；钩子在 throw 前不会读取它们。
// Placeholder options object; the hook throws before inspecting them.
function makeOptions() {
  return {
    onJobDescriptionMatched: vi.fn(),
    onProfileParsed: vi.fn(),
    onQuestionsGenerated: vi.fn(),
  };
}

describe("useResumeAnalysisPipeline", () => {
  it("invokes onProfileParsed after parse stream resolves", async () => {
    // 钩子返回 pipeline 实例；调用 handleResumeChange 后 onProfileParsed 应被触发。
    // Hook returns a pipeline; after handleResumeChange, onProfileParsed must be called.
    const options = makeOptions();
    const pipeline = useResumeAnalysisPipeline(options);

    await pipeline.handleResumeChange(FILE);

    expect(options.onProfileParsed).toHaveBeenCalledWith({
      fileName: FILE.name,
      resumeProfile: SAMPLE_PROFILE,
    });
    expect(pipeline.resumePayload?.resumeProfile).toEqual(SAMPLE_PROFILE);
  });

  it("invokes onQuestionsGenerated after Step 2 when no dedup hit", async () => {
    // 无查重命中时，流水线应继续生题并回调 onQuestionsGenerated。
    // With no dedup hit, the pipeline must proceed to questions generation.
    const options = makeOptions();
    const pipeline = useResumeAnalysisPipeline(options);

    await pipeline.handleResumeChange(FILE);

    expect(options.onQuestionsGenerated).toHaveBeenCalledWith(QUESTIONS);
    expect(pipeline.resumePayload?.interviewQuestions).toEqual(QUESTIONS);
  });

  it("pauses on dedup hit and resumes via handleDedupContinue", async () => {
    // 查重命中时暂停出题；handleDedupContinue 调用后恢复并触发 onQuestionsGenerated。
    // Pipeline pauses when dedup hits; handleDedupContinue resumes it.
    const options = makeOptions();
    const pipeline = useResumeAnalysisPipeline(options);

    await pipeline.handleResumeChange(FILE);

    // 查重命中时不应立即生题 / questions should NOT be generated on a dedup hit
    expect(options.onQuestionsGenerated).not.toHaveBeenCalled();
    expect(pipeline.dedupMatches?.length).toBeGreaterThan(0);

    pipeline.handleDedupContinue();
    await Promise.resolve();
    await Promise.resolve();

    expect(options.onQuestionsGenerated).toHaveBeenCalledWith(QUESTIONS);
  });
});
