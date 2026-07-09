import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("pipeline-stage-action-bar.tsx", import.meta.url), "utf-8");

describe("PipelineStageActionBar compact header actions", () => {
  it("renders current stage status without a full route stepper", () => {
    expect(source).toContain("aria-label={`当前招聘阶段：");
    expect(source).toContain("pipelineStageMeta[pipelineStage].label");
    expect(source).toContain('import { Badge } from "@/components/ui/badge";');
    expect(source).toContain("当前阶段：{pipelineStageMeta[pipelineStage].label}");
    expect(source).toContain("IconInfoCircle");
    expect(source).toContain('variant="ghost"');
    expect(source).toContain("onViewCurrentStage: () => void;");
    expect(source).toContain("onClick={onViewCurrentStage}");
    expect(source).not.toContain("getRouteSteps");
    expect(source).not.toContain("DEFAULT_ROUTE_STEPS");
  });

  it("shows the full recruiting flow from the current-stage hover card", () => {
    const hoverSource = source.slice(
      source.indexOf("function RecruitmentStageHoverCard"),
      source.indexOf("interface StageButton"),
    );

    expect(source).toContain('from "@/components/ui/hover-card";');
    expect(hoverSource).toContain("<HoverCard>");
    expect(hoverSource).toContain("<HoverCardTrigger");
    expect(hoverSource).toContain("<HoverCardContent");
    expect(hoverSource).toContain("完整招聘流程");
    expect(hoverSource).toContain("getHoverFlowSteps(pipelineStage)");
    expect(hoverSource).toContain("flowSteps.map((stage, index) =>");
    expect(hoverSource).toContain("isCurrent");
    expect(hoverSource).toContain("当前");
    expect(source).toContain("const DEFAULT_FLOW_STEPS: PipelineStage[] = [");
  });

  it("groups primary actions and renders close directly without a more menu", () => {
    const actionsSource = source.slice(
      source.indexOf("const hasPrimaryActions ="),
      source.indexOf("interface StageButton"),
    );

    expect(source).toContain("primaryAction?: ReactNode;");
    expect(source).toContain('import { ButtonGroup } from "@/components/ui/button-group";');
    expect(source).not.toContain('from "@/components/ui/dropdown-menu";');
    expect(actionsSource).toContain("<ButtonGroup");
    expect(actionsSource).toContain("{groupedPrimaryAction}");
    expect(actionsSource).toContain("hasPrimaryActions");
    expect(actionsSource).not.toContain("<DropdownMenu");
    expect(actionsSource).not.toContain("更多流程操作");
    expect(actionsSource).not.toContain("<IconDots");
    expect(actionsSource).toContain('variant="outline"');
    expect(actionsSource).toContain("bg-destructive/8");
    expect(actionsSource).toContain("text-destructive");
    expect(actionsSource).toContain("onClick={onRequestClose}");
    expect(actionsSource).toContain("标记结案");
    expect(source).toContain("安排真人面试");
    expect(source).toContain('key: "to-offer"');
    expect(source).not.toContain(
      '<Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">',
    );
  });

  it("suppresses external primary actions after the candidate is closed", () => {
    const renderSource = source.slice(
      source.indexOf("const actions = getStageActions"),
      source.indexOf("interface StageButton"),
    );
    const closedSource = source.slice(
      source.indexOf('if (pipelineStage === "closed")'),
      source.indexOf("const buttons"),
    );

    expect(renderSource).toContain(
      'const groupedPrimaryAction = pipelineStage === "closed" ? null : primaryAction;',
    );
    expect(renderSource).toContain('const canClose = pipelineStage !== "closed";');
    expect(renderSource).toContain("{groupedPrimaryAction}");
    expect(closedSource).toContain('key="reactivate"');
    expect(closedSource).not.toContain("primaryAction");
  });

  it("does not couple tab visibility to a duplicated route step model", () => {
    expect(source).not.toContain("showAiInterviewStep");
    expect(source).not.toContain("DEFAULT_ROUTE_STEPS_WITHOUT_AI");
    expect(source).not.toContain("ROUTE_WITH_WRITTEN_TEST");
  });

  it("gates human interview and offer stage actions by create permissions", () => {
    expect(source).toContain("canCreateHumanInterview?: boolean;");
    expect(source).toContain("canCreateOffer?: boolean;");
    expect(source).toContain("hasJobDescription?: boolean;");
    expect(source).toContain("canCreateHumanInterview = true");
    expect(source).toContain("canCreateOffer = true");
    expect(source).toContain("&& canCreateHumanInterview");
    expect(source).toContain("if (canCreateOffer) {");
    expect(source).toContain('hasEvent({ type: "SKIP_TO_HUMAN_INTERVIEW" })');
    expect(source).toContain('hasEvent({ type: "ADVANCE_TO_OFFER" })');
    expect(source).toContain("canApplyCandidatePipelineEvent");
    expect(source).not.toContain("getCandidatePipelineEvents");
  });

  it("requires a bound job before arranging human interview", () => {
    expect(source).toContain("hasJobDescription = true");
    expect(source).toContain("resolveHumanInterviewAdvanceDisabledReason");
    expect(source).toContain("请先绑定在招岗位后再安排真人面试");
    expect(source).toContain('hasEvent({ type: "SKIP_TO_HUMAN_INTERVIEW" })');
    expect(source).toContain('hasEvent({ type: "ADVANCE_TO_HUMAN_INTERVIEW" })');
    expect(source).toContain("HumanInterviewAdvanceButton");
  });

  it("keeps the AI interview next-step human interview button primary", () => {
    const aiStageSource = source.slice(
      source.indexOf('case "ai_interview":'),
      source.indexOf('case "human_interview":'),
    );

    expect(aiStageSource).toContain('hasEvent({ type: "ADVANCE_TO_HUMAN_INTERVIEW" })');
    expect(aiStageSource).toContain("<HumanInterviewAdvanceButton");
    expect(aiStageSource).not.toContain('variant={aiInterviewDone ? "default" : "outline"}');
    expect(aiStageSource).not.toContain('variant="outline"');
  });

  it("does not expose direct offer or backward stage actions", () => {
    expect(source).not.toContain("直接发 Offer");
    expect(source).not.toContain('onAdvance("offer")');
    expect(source).not.toContain("退回 AI 面试");
    expect(source).not.toContain("退回真人复面");
  });

  it("requires completed human interview feedback before advancing to offer", () => {
    expect(source).toContain("humanInterviewFeedbackComplete?: boolean;");
    expect(source).toContain("resolveOfferAdvanceDisabledReason");
    expect(source).toContain("OfferAdvanceButton");
    expect(source).toContain("请先完成所有真人面试轮次，并补全每轮面试评价");
    expect(source).toContain("aria-disabled={Boolean(disabledReason)}");
    expect(source).toContain("<TooltipTrigger render={button} />");
    expect(source).toContain("humanInterviewFeedbackComplete");
  });
});
