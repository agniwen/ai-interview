import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";

import { WorkflowNestedGraph } from "./workflow-nested-graph";

export interface WorkflowNestedGraphDialogProps {
  stepName: string;
  fullStep: string;
  stepGraph: SerializedStepFlowEntry[];
}

export function WorkflowNestedGraphDialog({
  stepName,
  fullStep,
  stepGraph,
}: WorkflowNestedGraphDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        查看嵌套图
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-full z-10">
          <DialogHeader>
            <DialogTitle>{stepName} 工作流</DialogTitle>
            <DialogDescription>查看此步骤的嵌套工作流图</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-[500px]">
            <ReactFlowProvider key={fullStep}>
              <WorkflowNestedGraph stepGraph={stepGraph} open={open} workflowName={fullStep} />
            </ReactFlowProvider>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
