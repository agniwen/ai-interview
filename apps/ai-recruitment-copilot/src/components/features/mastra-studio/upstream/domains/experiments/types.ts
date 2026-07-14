export interface ExperimentUISpan {
  id: string;
  name: string;
  type: string;
  latency: number;
  startTime: string;
  endTime?: string;
  spans?: ExperimentUISpan[];
  parentSpanId?: string | null;
}

export interface ExperimentUISpanStyle {
  icon?: React.ReactNode;
  color?: string;
  label?: string;
  bgColor?: string;
  typePrefix: string;
}

export type ExperimentUISpanType = "agent" | "workflow" | "tool" | "model" | "other";
