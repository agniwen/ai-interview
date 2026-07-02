import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("pipeline-stage-action-bar.tsx", import.meta.url), "utf-8");

describe("PipelineStageActionBar compact stage rail", () => {
  it("renders a compact rail without per-step status captions", () => {
    const railSource = source.slice(
      source.indexOf("<ol"),
      source.indexOf('<div className="flex flex-wrap items-center justify-end gap-2'),
    );

    expect(source).toContain("aria-label={`招聘流程，当前阶段：");
    expect(source).toContain("pipelineStageMeta[pipelineStage].label");
    expect(source).toContain("grid list-none overflow-x-auto rounded-xl bg-muted/30 p-2");
    expect(source).toContain("rounded-full px-2.5 py-1.5");
    expect(source).toContain("{pipelineStageMeta[stage].label}");
    expect(railSource).not.toContain("getStepCaption");
    expect(railSource).not.toContain("已完成");
    expect(railSource).not.toContain("下一步");
    expect(railSource).not.toContain("待进行");
  });

  it("only highlights the current step and keeps other steps muted", () => {
    const railSource = source.slice(
      source.indexOf("<ol"),
      source.indexOf('<div className="flex flex-wrap items-center justify-end gap-2'),
    );

    expect(railSource).toContain("const isCurrent = stage === pipelineStage;");
    expect(railSource).toContain("isCurrent");
    expect(railSource).toContain('"bg-primary text-primary-foreground shadow-xs"');
    expect(railSource).toContain(': "bg-background text-muted-foreground ring-1 ring-border/60"');
    expect(railSource).not.toContain('status === "done" && "border-primary');
    expect(railSource).not.toContain('status === "next" && "border-primary');
  });

  it("groups the primary resume actions together", () => {
    const actionsSource = source.slice(
      source.indexOf('<div className="flex flex-wrap items-center justify-end gap-2'),
      source.indexOf("</div>", source.indexOf("actions.right.length > 0")),
    );

    expect(source).toContain("primaryAction?: ReactNode;");
    expect(source).toContain('import { ButtonGroup } from "@/components/ui/button-group";');
    expect(actionsSource).toContain("<ButtonGroup");
    expect(actionsSource).toContain("{groupedPrimaryAction}");
    expect(actionsSource).toContain("groupedPrimaryAction || actions.right.length > 0");
    expect(source).toContain("安排真人面试");
    expect(source).toContain("直接发 Offer");
    expect(source).toContain('key: "to-offer"');
    expect(source).not.toContain(
      '<Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">',
    );
  });

  it("suppresses external primary actions after the candidate is closed", () => {
    const renderSource = source.slice(
      source.indexOf("const actions = getStageActions"),
      source.indexOf("const DEFAULT_ROUTE_STEPS"),
    );
    const closedSource = source.slice(
      source.indexOf('if (pipelineStage === "closed")'),
      source.indexOf("// 所有非 closed 阶段都能直接结案。"),
    );

    expect(renderSource).toContain(
      'const groupedPrimaryAction = pipelineStage === "closed" ? null : primaryAction;',
    );
    expect(renderSource).toContain("groupedPrimaryAction || actions.right.length > 0");
    expect(renderSource).toContain("{groupedPrimaryAction}");
    expect(closedSource).toContain('key="reactivate"');
    expect(closedSource).not.toContain("primaryAction");
  });

  it("can hide the AI interview step while resumes are still parsing", () => {
    expect(source).toContain("showAiInterviewStep?: boolean;");
    expect(source).toContain("showAiInterviewStep = true");
    expect(source).toContain("const DEFAULT_ROUTE_STEPS_WITHOUT_AI");
    expect(source).toContain(
      "showAiInterviewStep ? DEFAULT_ROUTE_STEPS : DEFAULT_ROUTE_STEPS_WITHOUT_AI",
    );
  });

  it("gates human interview and offer stage actions by dedicated permissions", () => {
    expect(source).toContain("canManageHumanInterview?: boolean;");
    expect(source).toContain("canManageOffer?: boolean;");
    expect(source).toContain("canManageHumanInterview = true");
    expect(source).toContain("canManageOffer = true");
    expect(source).toContain("canAdvanceToHumanInterview");
    expect(source).toContain("canAdvanceToOffer");
    expect(source).toContain("if (canAdvanceToHumanInterview) {");
    expect(source).toContain("if (canAdvanceToOffer) {");
    expect(source).toContain("if (canManageHumanInterview) {");
  });

  it("requires completed human interview feedback before advancing to offer", () => {
    expect(source).toContain("humanInterviewFeedbackComplete?: boolean;");
    expect(source).toContain("resolveOfferAdvanceDisabledReason");
    expect(source).toContain("OfferAdvanceButton");
    expect(source).toContain("请先完成所有真人面试轮次，并补全每轮面试评价");
    expect(source).toContain("aria-disabled={Boolean(disabledReason)}");
    expect(source).toContain("<TooltipTrigger asChild>{button}</TooltipTrigger>");
    expect(source).toContain("humanInterviewFeedbackComplete");
  });
});
