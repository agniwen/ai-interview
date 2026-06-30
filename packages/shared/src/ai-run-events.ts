export interface AiRunError {
  code?: string;
  detail?: unknown;
  message: string;
}

export type AiRunEvent =
  | {
      agentId?: string;
      runId: string;
      title: string;
      traceId?: string;
      type: "run.started";
      workflowId?: string;
    }
  | { at: string; runId: string; traceId?: string; type: "run.heartbeat" }
  | { label: string; runId: string; stepId: string; traceId?: string; type: "step.started" }
  | {
      label?: string;
      progress?: number;
      runId: string;
      stepId: string;
      traceId?: string;
      type: "step.progress";
    }
  | { runId: string; stepId: string; text: string; traceId?: string; type: "step.delta" }
  | {
      artifactType: string;
      data: unknown;
      runId: string;
      stepId: string;
      traceId?: string;
      type: "step.preview";
    }
  | {
      input?: unknown;
      label: string;
      runId: string;
      toolCallId: string;
      toolName: string;
      traceId?: string;
      type: "tool.started";
    }
  | {
      output?: unknown;
      runId: string;
      toolCallId: string;
      toolName: string;
      traceId?: string;
      type: "tool.completed";
    }
  | {
      payload: unknown;
      runId: string;
      stepId?: string;
      toolCallId?: string;
      traceId?: string;
      type: "approval.required";
    }
  | {
      payload?: unknown;
      runId: string;
      suspended: string[];
      traceId?: string;
      type: "run.suspended";
    }
  | { runId: string; stepId?: string; traceId?: string; type: "run.resumed" }
  | {
      artifactId?: string;
      artifactType: string;
      data: unknown;
      runId: string;
      traceId?: string;
      type: "artifact.created";
    }
  | {
      reason?: string;
      runId: string;
      score: number;
      scorerId: string;
      traceId?: string;
      type: "scorer.completed";
    }
  | { output?: unknown; runId: string; stepId: string; traceId?: string; type: "step.completed" }
  | { output?: unknown; runId: string; traceId?: string; type: "run.completed" }
  | { error: AiRunError; runId: string; traceId?: string; type: "run.failed" };

export type AiRunEventType = AiRunEvent["type"];

export function isAiRunTerminalEvent(event: AiRunEvent): boolean {
  return event.type === "run.completed" || event.type === "run.failed";
}
