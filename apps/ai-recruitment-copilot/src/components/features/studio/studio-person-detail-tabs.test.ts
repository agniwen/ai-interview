import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  new URL("studio-person-detail-controller.tsx", import.meta.url),
  "utf-8",
);
const bodySource = readFileSync(new URL("studio-person-detail-body.tsx", import.meta.url), "utf-8");
const resultContentSource = bodySource.slice(
  bodySource.indexOf("function InterviewResultTabContent"),
  bodySource.indexOf("export function StudioPersonDetailBody"),
);

describe("AI 面试详情 tabs", () => {
  it("keeps communication questions and form responses inside the result tab", () => {
    expect(controllerSource).not.toContain('value="questions"');
    expect(controllerSource).not.toContain('value="forms"');
    expect(bodySource).not.toContain('<TabsContent value="forms">');
    expect(bodySource).not.toContain("StudioPersonDetailQuestionsTab");
    expect(bodySource).toContain("<FrameTitle>表单题</FrameTitle>");
    expect(bodySource).toContain('emptyLabel="暂无表单答复" items={formItems}');
    expect(bodySource).toContain("<FrameTitle>沟通题</FrameTitle>");
    expect(bodySource).toContain('emptyLabel="暂无沟通题" items={interviewItems}');
  });

  it("shows agent instructions only in development", () => {
    expect(controllerSource).toContain(
      'const showAgentInstructions = import.meta.env.DEV && mode === "interview" && !isPublic',
    );
    expect(controllerSource.match(/import\.meta\.env\.DEV/g)).toHaveLength(1);
    expect(controllerSource).toContain("if (showAgentInstructions)");
    expect(controllerSource).toContain("{showAgentInstructions ? (");
    expect(bodySource).toContain("{showAgentInstructions ? (");
    expect(bodySource).not.toContain("import.meta.env.DEV");
  });

  it("places the form reset action in the form frame header", () => {
    const formTitleIndex = bodySource.indexOf("<FrameTitle>表单题</FrameTitle>");
    const formHeaderStart = bodySource.lastIndexOf("<FrameHeader", formTitleIndex);
    const formHeaderEnd = bodySource.indexOf("</FrameHeader>", formTitleIndex);
    expect(formTitleIndex).toBeGreaterThan(-1);
    expect(formHeaderStart).toBeGreaterThan(-1);
    expect(formHeaderEnd).toBeGreaterThan(formTitleIndex);
    expect(bodySource.slice(formHeaderStart, formHeaderEnd)).toContain(
      "<FormSubmissionResetAction",
    );
  });

  it("uses one coordinated grid for the four result frames", () => {
    expect(resultContentSource).toContain('<div className="grid gap-6 md:grid-cols-2">');
    expect(resultContentSource).toContain("<InterviewResultFrame");
    expect(resultContentSource).toContain("<FrameTitle>候选人信息</FrameTitle>");
    expect(resultContentSource).toContain("<FrameTitle>表单题</FrameTitle>");
    expect(resultContentSource).toContain("<FrameTitle>沟通题</FrameTitle>");
    expect(resultContentSource).not.toContain("<FrameTitle>轮次概览</FrameTitle>");
    expect(resultContentSource).not.toContain("重置轮次");
    expect(resultContentSource).toContain("重置沟通");
  });

  it("reuses the result layout in interview detail and recruitment detail", () => {
    const overviewBranch = bodySource.slice(
      bodySource.indexOf('<TabsContent value="overview">'),
      bodySource.indexOf('<TabsContent value="ai-analysis">'),
    );
    const recruitmentAiBranch = bodySource.slice(
      bodySource.indexOf('<TabsContent value="rounds">'),
      bodySource.indexOf('<TabsContent value="human-interview">'),
    );
    expect(overviewBranch).toContain("<InterviewResultTabContent");
    expect(recruitmentAiBranch).toContain("<InterviewResultTabContent");
  });

  it("places the text input switch inside candidate information", () => {
    const candidateTitleIndex = resultContentSource.indexOf("<FrameTitle>候选人信息</FrameTitle>");
    const candidateFrameEnd = resultContentSource.indexOf("</Frame>", candidateTitleIndex);
    const candidateFrame = resultContentSource.slice(candidateTitleIndex, candidateFrameEnd);
    expect(candidateTitleIndex).toBeGreaterThan(-1);
    expect(candidateFrameEnd).toBeGreaterThan(candidateTitleIndex);
    expect(candidateFrame).toContain("允许面试者文本输入");
    expect(candidateFrame).toContain("<Switch");
  });
});
