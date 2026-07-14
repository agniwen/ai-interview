import { Badge } from "@mastra/playground-ui/components/Badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@mastra/playground-ui/components/Collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { ChevronDown } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Fragment, useState } from "react";

import { useCurrentRun } from "../context/use-current-run";
import type { Condition } from "./utils";
import { getConditionIconAndColor } from "./workflow-node-badges";
import { WorkflowStepActionBar } from "./workflow-step-action-bar";

export type ConditionNode = Node<
  {
    conditions: Condition[];
    withoutTopHandle?: boolean;
    previousStepId: string;
    nextStepId: string;
    mapConfig?: string;
  },
  "condition-node"
>;

function WorkflowConditionItem({
  condition,
  index,
  nextStepExists,
  previousDisplayStatus,
  type,
}: {
  condition: Condition;
  index: number;
  nextStepExists: boolean;
  previousDisplayStatus?: string;
  type?: string;
}) {
  const [openDialog, setOpenDialog] = useState(false);
  const conjType = condition.conj || type;
  const { icon: ConjIconComponent, color: conjColor } = getConditionIconAndColor(conjType ?? "");
  const conjBadge =
    index === 0 ? null : (
      <Badge
        icon={
          ConjIconComponent ? (
            <ConjIconComponent
              className="text-current"
              {...(conjColor ? { style: { color: conjColor } } : {})}
            />
          ) : null
        }
      >
        {condition.conj?.toLocaleUpperCase() || "WHEN"}
      </Badge>
    );

  if (!condition.fnString) {
    return (
      <Fragment key={`${condition.ref?.path}-${index}`}>
        {condition.ref?.step ? (
          <div className="flex items-center gap-1">
            {conjBadge}
            <Txt variant="ui-xs" className=" text-neutral3 flex-1">
              {typeof condition.ref.step === "object" && condition.ref.step !== null
                ? String((condition.ref.step as { id?: unknown }).id ?? "")
                : String(condition.ref.step)}
              's {condition.ref.path}{" "}
              {Object.entries(condition.query).map(([key, value]) => `${key} ${String(value)}`)}
            </Txt>
          </div>
        ) : null}
      </Fragment>
    );
  }

  const code = String(condition.fnString).trim();
  return (
    <div key={`${condition.fnString}-${index}`} className="px-3">
      <Highlight theme={themes.oneDark} code={code} language="javascript">
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <button
            type="button"
            className={cn(
              "relative font-mono p-3 w-full cursor-pointer rounded-lg text-xs bg-surface4! whitespace-pre-wrap wrap-break-word",
              className,
              previousDisplayStatus === "success" && nextStepExists && "bg-accent1Dark!",
              previousDisplayStatus === "failed" && nextStepExists && "bg-accent2Dark!",
              previousDisplayStatus === "tripwire" && nextStepExists && "bg-amber-900/40!",
            )}
            onClick={() => setOpenDialog(true)}
            style={style}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })}>
                <span className="inline-block mr-2 text-neutral3">{lineIndex + 1}</span>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </button>
        )}
      </Highlight>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-[30rem]">
          <DialogHeader>
            <DialogTitle className="sr-only">Condition Function</DialogTitle>
            <DialogDescription>View the condition function code</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ScrollArea className="w-full" maxHeight="400px">
              <Highlight theme={themes.oneDark} code={code} language="javascript">
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre
                    className={`${className} relative font-mono text-sm overflow-x-auto p-3 w-full rounded-lg mt-2 dark:bg-zinc-800`}
                    style={{ ...style, backgroundColor: "#121212", padding: "0 0.75rem 0 0" }}
                  >
                    {tokens.map((line, lineIndex) => (
                      <div key={lineIndex} {...getLineProps({ line })}>
                        <span className="inline-block mr-2 text-neutral3">{lineIndex + 1}</span>
                        {line.map((token, tokenIndex) => (
                          <span key={tokenIndex} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </ScrollArea>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkflowConditionPanel({
  conditions,
  isCollapsible,
  nextStepExists,
  onOpenChange,
  open,
  previousDisplayStatus,
  type,
}: {
  conditions: Condition[];
  isCollapsible: boolean;
  nextStepExists: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  previousDisplayStatus?: string;
  type?: string;
}) {
  const { icon: IconComponent, color } = getConditionIconAndColor(type ?? "");
  return (
    <Collapsible open={isCollapsible ? open : true} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2">
        <Badge
          icon={
            IconComponent ? (
              <IconComponent className="text-current" {...(color ? { style: { color } } : {})} />
            ) : null
          }
        >
          {type?.toUpperCase()}
        </Badge>
        {isCollapsible && (
          <Icon>
            <ChevronDown
              className={cn("transition-transform text-neutral3", { "transform rotate-180": open })}
            />
          </Icon>
        )}
      </CollapsibleTrigger>
      {type === "else" ? null : (
        <CollapsibleContent className="flex flex-col gap-2 pb-2">
          {conditions.map((condition, index) => (
            <WorkflowConditionItem
              key={
                condition.fnString
                  ? `${condition.fnString}-${index}`
                  : `${condition.ref?.path}-${index}`
              }
              condition={condition}
              index={index}
              nextStepExists={nextStepExists}
              previousDisplayStatus={previousDisplayStatus}
              type={type}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function getConditionNodeClassName({
  hasNextStep,
  hasPreviousStep,
  nextStepStatus,
  previousDisplayStatus,
}: {
  hasNextStep: boolean;
  hasPreviousStep: boolean;
  nextStepStatus?: string;
  previousDisplayStatus?: string;
}) {
  return cn(
    "bg-surface3 rounded-lg w-dropdown-max-height border border-border1",
    previousDisplayStatus === "success" && hasNextStep && "bg-accent1Darker",
    previousDisplayStatus === "failed" && hasNextStep && "bg-accent2Darker",
    previousDisplayStatus === "tripwire" && hasNextStep && "bg-amber-950/40 border-amber-500/30",
    !hasPreviousStep && Boolean(nextStepStatus) && "bg-accent1Darker",
  );
}

export function WorkflowConditionNode({ data }: NodeProps<ConditionNode>) {
  const { conditions, previousStepId, nextStepId, withoutTopHandle } = data;
  const [open, setOpen] = useState(true);
  const type = conditions[0]?.type;
  const isCollapsible =
    (conditions.some((condition) => condition.fnString) || conditions?.length > 1) &&
    type !== "else";

  const { steps } = useCurrentRun();

  const previousStep = steps[previousStepId];
  const nextStep = steps[nextStepId];

  // Check if previous step is a tripwire (failed step with tripwire property)
  const isPreviousTripwire =
    previousStep?.status === "failed" && previousStep?.tripwire !== undefined;
  const previousDisplayStatus = isPreviousTripwire ? "tripwire" : previousStep?.status;

  return (
    <>
      {!withoutTopHandle && (
        <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
      )}

      <div
        data-workflow-node
        data-workflow-step-status={previousDisplayStatus}
        data-testid="workflow-condition-node"
        className={getConditionNodeClassName({
          hasNextStep: Boolean(nextStep),
          hasPreviousStep: Boolean(previousStep),
          nextStepStatus: nextStep?.status,
          previousDisplayStatus,
        })}
      >
        <WorkflowConditionPanel
          conditions={conditions}
          isCollapsible={isCollapsible}
          nextStepExists={Boolean(nextStep)}
          onOpenChange={(nextOpen) => {
            if (isCollapsible) {
              setOpen(nextOpen);
            }
          }}
          open={open}
          previousDisplayStatus={previousDisplayStatus}
          type={type}
        />

        <WorkflowStepActionBar
          stepName={nextStepId}
          input={previousStep?.output}
          mapConfig={data.mapConfig}
          tripwire={isPreviousTripwire ? previousStep?.tripwire : undefined}
          status={nextStep ? previousDisplayStatus : undefined}
        />
      </div>

      <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
    </>
  );
}
