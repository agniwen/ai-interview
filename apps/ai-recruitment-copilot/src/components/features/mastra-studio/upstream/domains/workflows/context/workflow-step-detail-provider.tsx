import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { WorkflowStepDetailContext } from "./workflow-step-detail-context";
import type { StepDetailData } from "./workflow-step-detail-context";

export function WorkflowStepDetailProvider({ children }: { children: ReactNode }) {
  const [stepDetail, setStepDetail] = useState<StepDetailData | null>(null);

  const showMapConfig = useCallback(
    ({ stepName, stepId, mapConfig }: { stepName: string; stepId?: string; mapConfig: string }) => {
      setStepDetail({
        mapConfig,
        stepId,
        stepName,
        type: "map-config",
      });
    },
    [],
  );

  const showNestedGraph = useCallback(
    ({
      label,
      stepGraph,
      fullStep,
    }: {
      label: string;
      stepGraph: SerializedStepFlowEntry[];
      fullStep: string;
    }) => {
      setStepDetail({
        nestedGraph: {
          fullStep,
          label,
          stepGraph,
        },
        stepName: label,
        type: "nested-graph",
      });
    },
    [],
  );

  const closeStepDetail = useCallback(() => {
    setStepDetail(null);
  }, []);

  return (
    <WorkflowStepDetailContext.Provider
      value={{
        closeStepDetail,
        showMapConfig,
        showNestedGraph,
        stepDetail,
      }}
    >
      {children}
    </WorkflowStepDetailContext.Provider>
  );
}
