import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { ProcessStepList, ProcessStepProgressBar } from "@mastra/playground-ui/components/Steps";
import type { ProcessStep } from "@mastra/playground-ui/components/Steps";
import { cn } from "@mastra/playground-ui/utils/cn";
import { OctagonXIcon } from "lucide-react";
import { Container } from "./shared";
import type {
  TemplateInstallState,
  TemplateWorkflowInfo,
} from "@/components/features/mastra-studio/upstream/hooks/use-templates";

interface TemplateInstallationProps {
  name: string;
  streamResult?: Partial<TemplateInstallState>;
  runId?: string;
  workflowInfo?: TemplateWorkflowInfo;
}

interface TemplateStepData {
  description?: string;
  id?: string;
  status?: string;
}

function isUserVisibleStep(
  stepId: string,
  workflowInfo?: TemplateInstallationProps["workflowInfo"],
): boolean {
  if (stepId === "input" || stepId.endsWith(".input")) {
    return false;
  }
  if (stepId.startsWith("Mapping_") && /[0-9a-f]{8}/.test(stepId)) {
    return false;
  }
  if (/[0-9a-f]{8,}/.test(stepId)) {
    return false;
  }
  return workflowInfo?.allSteps ? stepId in workflowInfo.allSteps : true;
}

function getPhaseMessage(phase: string, name: string): string {
  switch (phase) {
    case "initializing": {
      return "正在准备安装模板...";
    }
    case "processing": {
      return `正在安装 ${name} 模板`;
    }
    case "completed": {
      return "模板安装完成！";
    }
    case "error": {
      return "模板安装失败";
    }
    default: {
      return "正在安装模板...";
    }
  }
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return;
  }
  return typeof error === "string" ? error : String(error);
}

function TemplateInstallationStatus({
  currentStep,
  errorMessage,
  hasSteps,
  phase,
  steps,
}: {
  currentStep: ProcessStep | null;
  errorMessage?: string;
  hasSteps: boolean;
  phase: string;
  steps: ProcessStep[];
}) {
  return (
    <>
      {hasSteps && steps.length > 0 && phase !== "error" && (
        <div className="max-w-[30rem] w-full mx-auto px-6">
          <ProcessStepProgressBar steps={steps} />
        </div>
      )}

      {errorMessage && phase === "error" && (
        <div
          className={cn(
            "rounded-lg text-neutral5 p-6 flex items-center gap-3 text-ui-md bg-red-500/10",
            "[&>svg]:w-6 [&>svg]:h-6 [&>svg]:opacity-70 [&>svg]:text-red-500",
          )}
        >
          <OctagonXIcon />
          {errorMessage}
        </div>
      )}

      {hasSteps && <ProcessStepList steps={steps} currentStep={currentStep} className="pb-4" />}

      {!hasSteps && phase === "initializing" && (
        <div className="text-center text-sm text-neutral3 grid gap-4 justify-items-center">
          <Spinner />
          <p>这可能需要一些时间...</p>
        </div>
      )}
    </>
  );
}

export function TemplateInstallation({
  name,
  streamResult,
  runId,
  workflowInfo,
}: TemplateInstallationProps) {
  const phase = streamResult?.phase || "initializing";
  const workflowState = streamResult?.payload?.workflowState;
  const currentStep = streamResult?.payload?.currentStep;
  const error = streamResult?.error;
  const errorMessage = getErrorMessage(error);

  // Get steps from the workflow state
  const workflowSteps: Record<string, TemplateStepData> = workflowState?.steps || {};
  const hasSteps = Object.keys(workflowSteps).length > 0;

  const visibleSteps = Object.entries(workflowSteps).filter(([stepId]) =>
    isUserVisibleStep(stepId, workflowInfo),
  );

  const steps: ProcessStep[] = visibleSteps.map(([stepId, stepData]) => ({
    description: stepData?.description ?? "",
    id: stepId,
    isActive: currentStep?.id === stepId,
    status: stepData?.status ?? "pending",
    title: stepId.charAt(0).toUpperCase() + stepId.slice(1).replaceAll("-", " "),
  }));

  return (
    <Container className="space-y-6 text-neutral3 mb-8 content-center">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-neutral5">{getPhaseMessage(phase, name)}</h3>
        {(streamResult?.runId || runId) && (
          <div className="mt-2 text-ui-sm text-neutral3">
            运行 ID：{streamResult?.runId ?? runId}
          </div>
        )}
      </div>

      <TemplateInstallationStatus
        currentStep={steps.find((step) => step.id === currentStep?.id) ?? null}
        errorMessage={errorMessage}
        hasSteps={hasSteps}
        phase={phase}
        steps={steps}
      />
    </Container>
  );
}
