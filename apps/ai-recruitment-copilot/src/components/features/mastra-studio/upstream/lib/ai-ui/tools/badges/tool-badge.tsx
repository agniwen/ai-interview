import { CodeBlock } from "@mastra/playground-ui/components/CodeBlock";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { BackgroundTaskMetadataDialogTrigger } from "./background-task-metadata-dialog";
import { BadgeWrapper } from "./badge-wrapper";
import { NetworkChoiceMetadataDialogTrigger } from "./network-choice-metadata-dialog";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { ToolApprovalButtons } from "./tool-approval-buttons";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";

const JsonCodeBlock = ({ value, testId }: { value: unknown; testId: string }) => (
  <div data-testid={testId}>
    <CodeBlock
      code={JSON.stringify(value, null, 2) ?? String(value)}
      lang="json"
      overflow="scroll"
    />
  </div>
);

export interface ToolBadgeProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  toolName: string;
  args: Record<string, unknown> | string;
  result: unknown;
  metadata?: MessageMetadata;
  toolOutput: { toolId: string }[];
  suspendPayload?: unknown;
  toolCalled?: boolean;
  withoutArgs?: boolean;
}

const renderToolExtraInfo = (metadata: MessageMetadata | undefined, toolCallId: string) => {
  if (metadata?.mode === "network") {
    const { routingDecision } = metadata;
    return (
      <NetworkChoiceMetadataDialogTrigger
        selectionReason={routingDecision?.selectionReason ?? metadata.selectionReason ?? ""}
        input={
          (routingDecision ?? metadata.agentInput) as string | Record<string, unknown> | undefined
        }
      />
    );
  }
  const backgroundTask = metadata?.backgroundTasks?.[toolCallId];
  return backgroundTask?.taskId && backgroundTask.startedAt ? (
    <BackgroundTaskMetadataDialogTrigger backgroundTask={backgroundTask} />
  ) : null;
};

export const ToolBadge = ({
  toolName,
  args,
  result,
  metadata,
  toolOutput,
  toolCallId,
  toolApprovalMetadata,
  suspendPayload,
  isNetwork,
  toolCalled: toolCalledProp,
  withoutArgs,
}: ToolBadgeProps) => {
  let argSlot = null;

  try {
    const {
      __mastraMetadata: _,
      _background,
      ...formattedArgs
    } = typeof args === "object" ? args : JSON.parse(args);
    argSlot = <JsonCodeBlock value={formattedArgs} testId="tool-args" />;
  } catch {
    argSlot = (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {args as string}
      </pre>
    );
  }

  const resultSlot =
    typeof result === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">{result}</pre>
    ) : (
      <JsonCodeBlock value={result} testId="tool-result" />
    );

  const suspendPayloadSlot =
    typeof suspendPayload === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {suspendPayload}
      </pre>
    ) : (
      <CodeEditor
        data={suspendPayload as Record<string, unknown> | Record<string, unknown>[] | undefined}
        data-testid="tool-suspend-payload"
      />
    );

  const toolCalled = toolCalledProp ?? (result || toolOutput.length > 0);

  return (
    <BadgeWrapper
      data-testid="tool-badge"
      icon={<ToolsIcon className="text-accent6" />}
      title={toolName}
      extraInfo={renderToolExtraInfo(metadata, toolCallId)}
      initialCollapsed={!(toolApprovalMetadata ?? suspendPayload)}
    >
      <div className="space-y-4">
        {withoutArgs ? null : (
          <div>
            <p className="font-medium pb-2">Tool arguments</p>
            {argSlot}
          </div>
        )}

        {suspendPayloadSlot !== undefined && Boolean(suspendPayload) && (
          <div>
            <p className="font-medium pb-2">Tool suspend payload</p>
            {suspendPayloadSlot}
          </div>
        )}

        {resultSlot !== undefined && Boolean(result) && (
          <div>
            <p className="font-medium pb-2">Tool result</p>
            {resultSlot}
          </div>
        )}

        {toolOutput.length > 0 && (
          <div>
            <p className="font-medium pb-2">Tool output</p>

            <div className="h-40 overflow-y-auto">
              <CodeEditor data={toolOutput} data-testid="tool-output" />
            </div>
          </div>
        )}

        <ToolApprovalButtons
          toolCalled={Boolean(toolCalled)}
          toolCallId={toolCallId}
          toolApprovalMetadata={toolApprovalMetadata}
          toolName={toolName}
          isNetwork={isNetwork}
          isGenerateMode={metadata?.mode === "generate"}
        />
      </div>
    </BadgeWrapper>
  );
};
