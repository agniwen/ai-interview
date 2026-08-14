import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { useState } from "react";

import { CodeDialogContent } from "./workflow-code-dialog-content";

export interface WorkflowMapConfigDialogProps {
  stepName: string;
  mapConfig: string;
}

export function WorkflowMapConfigDialog({ stepName, mapConfig }: WorkflowMapConfigDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        映射配置
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>{stepName} 配置</DialogTitle>
            <DialogDescription>查看此步骤的映射配置</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CodeDialogContent data={mapConfig} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
