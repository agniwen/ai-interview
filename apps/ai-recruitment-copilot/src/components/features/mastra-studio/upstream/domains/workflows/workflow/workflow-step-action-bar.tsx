import type { TimeTravelParams } from "@mastra/client-js";
import type { WorkflowRunStatus } from "@mastra/core/workflows";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import {
  AlertCircleIcon,
  BracesIcon,
  Clock3Icon,
  LayersIcon,
  MoreVerticalIcon,
  PlayIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  StepForwardIcon,
} from "lucide-react";
import { useContext, useMemo, useState } from "react";
import type { TripwireData } from "../context/use-current-run";
import { WorkflowRunContext } from "../context/workflow-run-context";
import { useWorkflowStepDetail } from "../context/workflow-step-detail-context";
import { CodeDialogContent } from "./workflow-code-dialog-content";
import { WorkflowTimeTravelForm } from "./workflow-time-travel-form";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

export interface WorkflowStepActionBarProps {
  input?: unknown;
  resumeData?: unknown;
  output?: unknown;
  suspendOutput?: unknown;
  error?: unknown;
  tripwire?: TripwireData;
  stepName: string;
  stepId?: string;
  mapConfig?: string;
  onShowNestedGraph?: () => void;
  status?: WorkflowRunStatus;
  stepKey?: string;
  stepsFlow?: Record<string, string[]>;
}

function buildSuccessContext(input: Record<string, unknown>) {
  const context: NonNullable<TimeTravelParams["context"]> = {};
  for (const stepId of Object.keys(input)) {
    context[stepId] = { output: input[stepId], status: "success" };
  }
  return context;
}

interface StepActionMenuProps {
  error?: unknown;
  handleMapConfigClick: () => void;
  handleNestedGraphClick: () => void;
  handleRunMapStep: (isContinueRun?: boolean) => void;
  isMapConfigOpen: boolean;
  isNestedGraphOpen: boolean;
  mapConfig?: string;
  onShowNestedGraph?: () => void;
  resumeData?: unknown;
  setIsContinueRunOpen: (open: boolean) => void;
  setIsErrorOpen: (open: boolean) => void;
  setIsPerStepRunOpen: (open: boolean) => void;
  setIsResumeDataOpen: (open: boolean) => void;
  setIsTimeTravelOpen: (open: boolean) => void;
  setIsTripwireOpen: (open: boolean) => void;
  showDebugMode: boolean;
  showTimeTravel: boolean;
  tripwire?: TripwireData;
}

function StepActionMenu(props: StepActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="步骤操作"
          title="步骤操作"
          className="nodrag nopan"
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {props.onShowNestedGraph && (
          <DropdownMenu.Item onSelect={props.handleNestedGraphClick}>
            <LayersIcon />
            <span>{props.isNestedGraphOpen ? "隐藏嵌套图" : "查看嵌套图"}</span>
          </DropdownMenu.Item>
        )}
        {props.showTimeTravel && (
          <DropdownMenu.Item onSelect={() => props.setIsTimeTravelOpen(true)}>
            <Clock3Icon />
            <span>时间回溯</span>
          </DropdownMenu.Item>
        )}
        {props.showDebugMode && (
          <>
            <DropdownMenu.Item
              onSelect={() =>
                props.mapConfig ? props.handleRunMapStep() : props.setIsPerStepRunOpen(true)
              }
            >
              <PlayIcon />
              <span>运行步骤</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() =>
                props.mapConfig ? props.handleRunMapStep(true) : props.setIsContinueRunOpen(true)
              }
            >
              <StepForwardIcon />
              <span>继续运行</span>
            </DropdownMenu.Item>
          </>
        )}
        {props.mapConfig && (
          <DropdownMenu.Item onSelect={props.handleMapConfigClick}>
            <BracesIcon />
            <span>{props.isMapConfigOpen ? "隐藏映射配置" : "映射配置"}</span>
          </DropdownMenu.Item>
        )}
        {Boolean(props.resumeData) && (
          <DropdownMenu.Item onSelect={() => props.setIsResumeDataOpen(true)}>
            <RotateCcwIcon />
            <span>恢复数据</span>
          </DropdownMenu.Item>
        )}
        {Boolean(props.error) && (
          <DropdownMenu.Item onSelect={() => props.setIsErrorOpen(true)}>
            <AlertCircleIcon />
            <span>错误</span>
          </DropdownMenu.Item>
        )}
        {props.tripwire && (
          <DropdownMenu.Item
            onSelect={() => props.setIsTripwireOpen(true)}
            className="text-amber-400"
          >
            <ShieldAlertIcon />
            <span>拦截器</span>
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

function getStepActionVisibility({
  debugMode,
  error,
  mapConfig,
  onShowNestedGraph,
  resumeData,
  stepDetail,
  stepKey,
  stepName,
  stepPayload,
  tripwire,
  withoutTimeTravel,
  workflowStatus,
}: {
  debugMode: boolean;
  error?: unknown;
  mapConfig?: string;
  onShowNestedGraph?: () => void;
  resumeData?: unknown;
  stepDetail?: { type: string | null; stepName?: string } | null;
  stepKey?: string;
  stepName: string;
  stepPayload?: unknown;
  tripwire?: TripwireData;
  withoutTimeTravel?: boolean;
  workflowStatus?: WorkflowRunStatus;
}) {
  const showTimeTravel = Boolean(
    !withoutTimeTravel &&
    stepKey &&
    !mapConfig &&
    workflowStatus !== "running" &&
    workflowStatus !== "paused",
  );
  const inDebugMode = Boolean(stepKey && debugMode && workflowStatus === "paused");
  const showDebugMode = Boolean(inDebugMode && stepPayload);
  const isMapConfigOpen = stepDetail?.type === "map-config" && stepDetail.stepName === stepName;
  const isNestedGraphOpen = stepDetail?.type === "nested-graph" && stepDetail.stepName === stepName;
  const hasActions = Boolean(
    error ||
    tripwire ||
    mapConfig ||
    resumeData ||
    onShowNestedGraph ||
    showTimeTravel ||
    showDebugMode,
  );
  return {
    hasActions,
    inDebugMode,
    isMapConfigOpen,
    isNestedGraphOpen,
    showDebugMode,
    showTimeTravel,
  };
}

function DebugStepDialogs({
  inputData,
  isContinueRunOpen,
  isPerStepRunOpen,
  mapConfig,
  setIsContinueRunOpen,
  setIsPerStepRunOpen,
  showDebugMode,
  stepKey,
}: {
  inputData?: unknown;
  isContinueRunOpen: boolean;
  isPerStepRunOpen: boolean;
  mapConfig?: string;
  setIsContinueRunOpen: (open: boolean) => void;
  setIsPerStepRunOpen: (open: boolean) => void;
  showDebugMode: boolean;
  stepKey?: string;
}) {
  if (!showDebugMode || mapConfig || !stepKey) {
    return null;
  }
  return (
    <>
      <Dialog open={isPerStepRunOpen} onOpenChange={setIsPerStepRunOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>运行步骤 {stepKey}</DialogTitle>
            <DialogDescription>运行指定的工作流步骤</DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[600px]">
            <WorkflowTimeTravelForm
              stepKey={stepKey}
              closeModal={() => setIsPerStepRunOpen(false)}
              isPerStepRun
              buttonText="运行步骤"
              inputData={inputData}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog open={isContinueRunOpen} onOpenChange={setIsContinueRunOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>继续运行 {stepKey}</DialogTitle>
            <DialogDescription>从此步骤继续工作流运行</DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[600px]">
            <WorkflowTimeTravelForm
              stepKey={stepKey}
              closeModal={() => setIsContinueRunOpen(false)}
              isContinueRun
              buttonText="继续运行"
              inputData={inputData}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const WorkflowStepActionBar = ({
  input: _input,
  resumeData,
  output: _output,
  suspendOutput: _suspendOutput,
  error,
  tripwire,
  mapConfig,
  stepName,
  stepId,
  onShowNestedGraph,
  stepKey,
  stepsFlow,
}: WorkflowStepActionBarProps) => {
  const [isResumeDataOpen, setIsResumeDataOpen] = useState(false);
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const [isTripwireOpen, setIsTripwireOpen] = useState(false);
  const [isTimeTravelOpen, setIsTimeTravelOpen] = useState(false);
  const [isContinueRunOpen, setIsContinueRunOpen] = useState(false);
  const [isPerStepRunOpen, setIsPerStepRunOpen] = useState(false);

  const {
    withoutTimeTravel,
    debugMode,
    result,
    runSnapshot,
    timeTravelWorkflowStream,
    runId: prevRunId,
    workflowId,
    setDebugMode,
  } = useContext(WorkflowRunContext);
  const { showMapConfig, stepDetail, closeStepDetail } = useWorkflowStepDetail();
  const requestContext = useMergedRequestContext();

  const workflowStatus = result?.status ?? runSnapshot?.status;

  const dialogContentClass = "max-w-4xl w-full";

  const inDebugMode = Boolean(stepKey && debugMode && workflowStatus === "paused");

  const stepPayload = useMemo(() => {
    if (!stepKey || !inDebugMode) {
      return;
    }
    const previousSteps = stepsFlow?.[stepKey] ?? [];
    if (previousSteps.length === 0) {
      return;
    }

    if (previousSteps.length > 1) {
      const input: Record<string, unknown> = {};
      for (const previousStepId of previousSteps) {
        if (result?.steps?.[previousStepId]?.status === "success") {
          input[previousStepId] = result.steps[previousStepId].output;
        }
      }
      return {
        hasMultiSteps: true,
        input,
      };
    }

    const [prevStepId] = previousSteps;
    if (result?.steps?.[prevStepId]?.status === "success") {
      return {
        hasMultiSteps: false,
        input: result?.steps?.[prevStepId].output,
      };
    }
  }, [stepKey, stepsFlow, inDebugMode, result]);

  const isStepPending = stepKey ? !result?.steps?.[stepKey] : false;
  const { hasActions, isMapConfigOpen, isNestedGraphOpen, showDebugMode, showTimeTravel } =
    getStepActionVisibility({
      debugMode,
      error,
      mapConfig,
      onShowNestedGraph,
      resumeData,
      stepDetail,
      stepKey,
      stepName,
      stepPayload: stepPayload && isStepPending ? stepPayload : undefined,
      tripwire,
      withoutTimeTravel,
      workflowStatus,
    });

  const handleMapConfigClick = () => {
    if (isMapConfigOpen) {
      closeStepDetail();
    } else if (mapConfig) {
      showMapConfig({ mapConfig, stepId, stepName });
    }
  };

  const handleNestedGraphClick = () => {
    if (isNestedGraphOpen) {
      closeStepDetail();
    } else {
      onShowNestedGraph?.();
    }
  };

  const handleRunMapStep = (isContinueRun?: boolean) => {
    if (!stepKey || !stepPayload) {
      return;
    }

    const payload: Parameters<typeof timeTravelWorkflowStream>[0] = {
      inputData: stepPayload.hasMultiSteps
        ? undefined
        : (stepPayload.input as TimeTravelParams["inputData"]),
      requestContext,
      runId: prevRunId,
      step: stepKey,
      workflowId,
      ...(isContinueRun ? { perStep: false } : {}),
      ...(stepPayload?.hasMultiSteps
        ? {
            context: buildSuccessContext(stepPayload.input as Record<string, unknown>),
          }
        : {}),
    };

    if (isContinueRun) {
      setDebugMode(false);
    }

    void timeTravelWorkflowStream(payload);
  };

  if (!hasActions) {
    return null;
  }

  return (
    <>
      <StepActionMenu
        error={error}
        handleMapConfigClick={handleMapConfigClick}
        handleNestedGraphClick={handleNestedGraphClick}
        handleRunMapStep={handleRunMapStep}
        isMapConfigOpen={isMapConfigOpen}
        isNestedGraphOpen={isNestedGraphOpen}
        mapConfig={mapConfig}
        onShowNestedGraph={onShowNestedGraph}
        resumeData={resumeData}
        setIsContinueRunOpen={setIsContinueRunOpen}
        setIsErrorOpen={setIsErrorOpen}
        setIsPerStepRunOpen={setIsPerStepRunOpen}
        setIsResumeDataOpen={setIsResumeDataOpen}
        setIsTimeTravelOpen={setIsTimeTravelOpen}
        setIsTripwireOpen={setIsTripwireOpen}
        showDebugMode={Boolean(showDebugMode)}
        showTimeTravel={Boolean(showTimeTravel)}
        tripwire={tripwire}
      />

      {showTimeTravel && stepKey && (
        <Dialog open={isTimeTravelOpen} onOpenChange={setIsTimeTravelOpen}>
          <DialogContent className={dialogContentClass}>
            <DialogHeader>
              <DialogTitle>时间回溯到 {stepKey}</DialogTitle>
              <DialogDescription>回溯到指定的工作流步骤</DialogDescription>
            </DialogHeader>
            <DialogBody className="max-h-[600px]">
              <WorkflowTimeTravelForm
                stepKey={stepKey}
                closeModal={() => setIsTimeTravelOpen(false)}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      <DebugStepDialogs
        inputData={stepPayload?.input}
        isContinueRunOpen={isContinueRunOpen}
        isPerStepRunOpen={isPerStepRunOpen}
        mapConfig={mapConfig}
        setIsContinueRunOpen={setIsContinueRunOpen}
        setIsPerStepRunOpen={setIsPerStepRunOpen}
        showDebugMode={Boolean(showDebugMode)}
        stepKey={stepKey}
      />

      {resumeData && (
        <Dialog open={isResumeDataOpen} onOpenChange={setIsResumeDataOpen}>
          <DialogContent className={dialogContentClass}>
            <DialogHeader>
              <DialogTitle>{stepName} 恢复数据</DialogTitle>
              <DialogDescription>查看此步骤的恢复数据</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <CodeDialogContent data={resumeData} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      {error && (
        <Dialog open={isErrorOpen} onOpenChange={setIsErrorOpen}>
          <DialogContent className={dialogContentClass}>
            <DialogHeader>
              <DialogTitle>{stepName} 错误</DialogTitle>
              <DialogDescription>查看此步骤的错误详情</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <CodeDialogContent data={error} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      {tripwire && (
        <Dialog open={isTripwireOpen} onOpenChange={setIsTripwireOpen}>
          <DialogContent className={dialogContentClass}>
            <DialogHeader>
              <DialogTitle>{stepName} 拦截器</DialogTitle>
              <DialogDescription>查看此步骤的拦截器详情</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <CodeDialogContent
                data={{
                  metadata: tripwire.metadata,
                  processorId: tripwire.processorId,
                  reason: tripwire.reason,
                  retry: tripwire.retry,
                }}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
