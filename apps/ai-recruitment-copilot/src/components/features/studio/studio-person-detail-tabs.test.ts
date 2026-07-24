import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  new URL("studio-person-detail-controller.tsx", import.meta.url),
  "utf-8",
);
const bodySource = readFileSync(new URL("studio-person-detail-body.tsx", import.meta.url), "utf-8");

describe("AI 面试详情 tabs", () => {
  it("keeps AI questions and form responses inside the result tab", () => {
    expect(controllerSource).not.toContain('value="questions"');
    expect(controllerSource).not.toContain('value="forms"');
    expect(bodySource).not.toContain('<TabsContent value="forms">');
    expect(bodySource).not.toContain("StudioPersonDetailQuestionsTab");
    expect(bodySource).toContain("<FrameTitle>表单题</FrameTitle>");
    expect(bodySource).toContain('emptyLabel="暂无表单答复" items={formItems}');
    expect(bodySource).toContain("<FrameTitle>面试题</FrameTitle>");
    expect(bodySource).toContain('emptyLabel="暂无面试题" items={interviewItems}');
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
});
