import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  new URL("studio-person-detail-controller.tsx", import.meta.url),
  "utf-8",
);
const headerSource = readFileSync(
  new URL("studio-person-detail-header.tsx", import.meta.url),
  "utf-8",
);
const bodySource = readFileSync(new URL("studio-person-detail-body.tsx", import.meta.url), "utf-8");
const resultContentSource = readFileSync(
  new URL("interview-result/interview-result-tab-content.tsx", import.meta.url),
  "utf-8",
);
const reportDetailsSource = readFileSync(
  new URL("interview-result/interview-report-details.tsx", import.meta.url),
  "utf-8",
);
const resultFrameSource = readFileSync(
  new URL("interview-result/interview-result-frame.tsx", import.meta.url),
  "utf-8",
);
const recordSelectorSource = readFileSync(
  new URL("interview-result/interview-record-selector.tsx", import.meta.url),
  "utf-8",
);

describe("AI 面试详情 tabs", () => {
  it("places the resume activity timeline in a right rail on wide screens", () => {
    expect(headerSource).toContain(
      'const showTimelineRail = mode === "resume" && !isPublic && activeTab === "overview"',
    );
    expect(headerSource).toContain("xl:grid-cols-[minmax(0,1fr)_28rem]");
    expect(bodySource).toContain("{showTimelineRail ? (");
    expect(bodySource).toContain("<aside");
    expect(bodySource).toContain('density="rail"');
    expect(bodySource).not.toContain("showTimelineAtBottom");
  });

  it("keeps communication questions and form responses inside the result tab", () => {
    expect(controllerSource).not.toContain('value="questions"');
    expect(controllerSource).not.toContain('value="forms"');
    expect(bodySource).not.toContain('<TabsContent value="forms">');
    expect(bodySource).not.toContain("StudioPersonDetailQuestionsTab");
    expect(resultContentSource).toContain("<FrameTitle>表单题</FrameTitle>");
    expect(resultContentSource).toContain('emptyLabel="暂无表单答复" items={formItems}');
    expect(resultContentSource).toContain("<FrameTitle>沟通题</FrameTitle>");
    expect(resultContentSource).toContain('emptyLabel="暂无沟通题"');
    expect(resultContentSource).toContain("items={interviewItems}");
  });

  it("shows agent instructions only in development", () => {
    expect(controllerSource).toContain(
      'const showAgentInstructions = import.meta.env.DEV && mode === "interview" && !isPublic',
    );
    expect(controllerSource.match(/import\.meta\.env\.DEV/g)).toHaveLength(1);
    expect(headerSource).toContain("{showAgentInstructions ? (");
    expect(bodySource).toContain("{showAgentInstructions ? (");
  });

  it("places the form reset action in the form frame header", () => {
    const formTitleIndex = resultContentSource.indexOf("<FrameTitle>表单题</FrameTitle>");
    const formHeaderStart = resultContentSource.lastIndexOf("<FrameHeader", formTitleIndex);
    const formHeaderEnd = resultContentSource.indexOf("</FrameHeader>", formTitleIndex);
    expect(formTitleIndex).toBeGreaterThan(-1);
    expect(formHeaderStart).toBeGreaterThan(-1);
    expect(formHeaderEnd).toBeGreaterThan(formTitleIndex);
    expect(resultContentSource.slice(formHeaderStart, formHeaderEnd)).toContain(
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

  it("places reset communication in the communication frame header", () => {
    const communicationTitleIndex = resultContentSource.indexOf("<FrameTitle>沟通题</FrameTitle>");
    const communicationHeaderStart = resultContentSource.lastIndexOf(
      "<FrameHeader",
      communicationTitleIndex,
    );
    const communicationHeaderEnd = resultContentSource.indexOf(
      "</FrameHeader>",
      communicationTitleIndex,
    );
    const communicationHeader = resultContentSource.slice(
      communicationHeaderStart,
      communicationHeaderEnd,
    );
    expect(communicationHeader).toContain("重置沟通");
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

  it("replaces the standalone report tab with a report selector in the result tab", () => {
    expect(controllerSource).not.toContain('value="reports"');
    expect(bodySource).not.toContain('<TabsContent value="reports">');
    expect(recordSelectorSource).toContain("reports.length > 1");
    expect(recordSelectorSource).toContain("<Select");
    expect(resultContentSource).toContain("onSelectedReportChange");
  });

  it("shows selected interview start and end times at the top of the result frame", () => {
    expect(resultFrameSource).toContain('label="开始时间"');
    expect(resultFrameSource).toContain('label="结束时间"');
    expect(resultFrameSource).toContain("<TimeDisplay");
  });

  it("always shows the copy interview link in development and only while pending otherwise", () => {
    expect(resultFrameSource).toContain('import.meta.env.DEV || record.roundStatus === "pending"');
    expect(resultFrameSource).toContain("copyInterviewLink");
    expect(resultFrameSource).toContain("<IconCopy");
    expect(resultFrameSource).toContain("复制面试链接");
    expect(resultFrameSource.indexOf("复制面试链接")).toBeLessThan(
      resultFrameSource.indexOf("</Frame>"),
    );
    expect(resultContentSource).toContain("record={record}");
  });

  it("shows recommended questions beside the copy link when questions exist", () => {
    expect(resultFrameSource).toContain("record.interviewQuestions");
    expect(resultFrameSource).toContain("查看推荐问题");
    expect(resultFrameSource).toContain("<RecommendedQuestionsDialog");
    expect(resultFrameSource).toContain("sm:grid-cols-2");
    expect(resultFrameSource).toContain("hasRecommendedQuestions");
    expect(resultFrameSource).toContain("showCopyInterviewLink");
  });

  it("shows frame skeletons while a selected report is being fetched", () => {
    expect(resultContentSource).toContain("isSelectedReportLoading");
    expect(resultContentSource).toContain("<InterviewResultFramesSkeleton");
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

  it("limits form and communication frame bodies with scroll areas", () => {
    for (const title of ["表单题", "沟通题"]) {
      const titleIndex = resultContentSource.indexOf(`<FrameTitle>${title}</FrameTitle>`);
      const frameEnd = resultContentSource.indexOf("</Frame>", titleIndex);
      const frame = resultContentSource.slice(titleIndex, frameEnd);
      expect(frame).toContain('<ScrollArea className="max-h-[28rem]" scrollFade>');
    }
  });

  it("does not render the resume evaluation below the result frames", () => {
    expect(resultContentSource).not.toContain("简历评价");
    expect(resultContentSource).not.toContain("record.notes");
  });

  it("reveals the latest report details from a ghost button", () => {
    expect(resultContentSource).toContain("<InterviewReportDetailsDisclosure>");
    expect(resultContentSource).toContain("<InterviewReportDetails");
    expect(resultContentSource).toContain('surface="frame"');
  });

  it("uses frames for the latest report summary, metrics, and transcript", () => {
    expect(reportDetailsSource).toContain('title="最终总结"');
    expect(reportDetailsSource).toContain('title="评估指标"');
    expect(reportDetailsSource).toContain('title="对话记录"');
    expect(reportDetailsSource).toContain('surface === "card"');
    expect(reportDetailsSource).toContain("<Frame");
    expect(reportDetailsSource).toContain("<EvaluationResults");
    expect(reportDetailsSource).toContain("<ConversationTranscript");
  });
});
