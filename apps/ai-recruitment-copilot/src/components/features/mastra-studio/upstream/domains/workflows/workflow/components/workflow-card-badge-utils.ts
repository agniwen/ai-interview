import {
  CalendarClock,
  Clock,
  CornerDownRight,
  GitBranch,
  Layers,
  List,
  Network,
  PlayCircle,
  RefreshCw,
  Repeat,
  Repeat1,
  Timer,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const BADGE_COLORS = {
  after: "#14B8A6",
  dountil: "#8B5CF6",
  dowhile: "#06B6D4",
  else: "#6B7280",
  forEach: "#F97316",
  if: "#3B82F6",
  map: "#F97316",
  parallel: "#3B82F6",
  sleep: "#A855F7",
  suspend: "#EC4899",
  until: "#F59E0B",
  when: "#ECB047",
  while: "#10B981",
  workflow: "#8B5CF6",
} as const;

export const BADGE_ICONS = {
  after: Clock,
  dountil: Repeat1,
  dowhile: Repeat,
  else: CornerDownRight,
  forEach: List,
  if: GitBranch,
  map: List,
  parallel: Workflow,
  sleep: Timer,
  sleepUntil: CalendarClock,
  suspend: PlayCircle,
  until: Timer,
  when: Network,
  while: RefreshCw,
  workflow: Layers,
} as const;

export interface ConditionIconConfig {
  icon: LucideIcon | undefined;
  color: string | undefined;
}

export interface WorkflowCardIndicator {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

const CONDITION_LABELS: Record<string, string> = {
  and: "And condition",
  dountil: "Do until condition",
  dowhile: "Do while condition",
  else: "Else condition",
  if: "If condition",
  not: "Not condition",
  or: "Or condition",
  until: "Until condition",
  when: "When condition",
  while: "While condition",
};

export const getConditionIconAndColor = (type?: string): ConditionIconConfig => {
  switch (type) {
    case "when": {
      return { color: BADGE_COLORS.when, icon: BADGE_ICONS.when };
    }
    case "dountil": {
      return { color: BADGE_COLORS.dountil, icon: BADGE_ICONS.dountil };
    }
    case "dowhile": {
      return { color: BADGE_COLORS.dowhile, icon: BADGE_ICONS.dowhile };
    }
    case "until": {
      return { color: BADGE_COLORS.until, icon: BADGE_ICONS.until };
    }
    case "while": {
      return { color: BADGE_COLORS.while, icon: BADGE_ICONS.while };
    }
    case "if": {
      return { color: BADGE_COLORS.if, icon: BADGE_ICONS.if };
    }
    case "else": {
      return { color: BADGE_COLORS.else, icon: BADGE_ICONS.else };
    }
    case "and":
    case "or":
    case "not": {
      return { color: BADGE_COLORS.when, icon: BADGE_ICONS.when };
    }
    default: {
      return { color: undefined, icon: undefined };
    }
  }
};

export const getConditionIndicator = (type?: string): WorkflowCardIndicator | undefined => {
  const { icon, color } = getConditionIconAndColor(type);

  if (!type || !icon || !color) {
    return undefined;
  }

  return {
    color,
    icon,
    id: `condition-${type}`,
    label: CONDITION_LABELS[type] ?? `${type} condition`,
  };
};

export interface WorkflowNodeBadgeInfo {
  isSleepNode: boolean;
  isForEachNode: boolean;
  isMapNode: boolean;
  isNestedWorkflow: boolean;
  hasSpecialBadge: boolean;
}

export interface WorkflowCardBadgesProps {
  duration?: number;
  date?: Date;
  isForEach?: boolean;
  mapConfig?: string;
  canSuspend?: boolean;
  isParallel?: boolean;
  stepGraph?: unknown;
}

export const getNodeBadgeInfo = ({
  duration,
  date,
  isForEach,
  mapConfig,
  canSuspend,
  isParallel,
  stepGraph,
}: WorkflowCardBadgesProps): WorkflowNodeBadgeInfo => {
  const isSleepNode = Boolean(duration || date);
  const isForEachNode = Boolean(isForEach);
  const isMapNode = Boolean(mapConfig && !isForEach);
  const isNestedWorkflow = Boolean(stepGraph);
  const hasSpecialBadge =
    isSleepNode ||
    Boolean(canSuspend || isParallel) ||
    isForEachNode ||
    isMapNode ||
    isNestedWorkflow;

  return {
    hasSpecialBadge,
    isForEachNode,
    isMapNode,
    isNestedWorkflow,
    isSleepNode,
  };
};

export const getNodeIndicators = (props: WorkflowCardBadgesProps): WorkflowCardIndicator[] => {
  const { isSleepNode, isForEachNode, isMapNode, isNestedWorkflow } = getNodeBadgeInfo(props);
  const indicators: WorkflowCardIndicator[] = [];

  if (isSleepNode) {
    indicators.push({
      color: BADGE_COLORS.sleep,
      icon: props.date ? BADGE_ICONS.sleepUntil : BADGE_ICONS.sleep,
      id: props.date ? "sleep-until" : "sleep",
      label: props.date ? "Sleep until step" : "Sleep step",
    });
  }

  if (props.canSuspend) {
    indicators.push({
      color: BADGE_COLORS.suspend,
      icon: BADGE_ICONS.suspend,
      id: "suspend",
      label: "Suspend/resume step",
    });
  }

  if (props.isParallel) {
    indicators.push({
      color: BADGE_COLORS.parallel,
      icon: BADGE_ICONS.parallel,
      id: "parallel",
      label: "Parallel step",
    });
  }

  if (isNestedWorkflow) {
    indicators.push({
      color: BADGE_COLORS.workflow,
      icon: BADGE_ICONS.workflow,
      id: "workflow",
      label: "Nested workflow step",
    });
  }

  if (isForEachNode) {
    indicators.push({
      color: BADGE_COLORS.forEach,
      icon: BADGE_ICONS.forEach,
      id: "foreach",
      label: "Foreach step",
    });
  }

  if (isMapNode) {
    indicators.push({
      color: BADGE_COLORS.map,
      icon: BADGE_ICONS.map,
      id: "map",
      label: "Map step",
    });
  }

  return indicators;
};

export const getWorkflowCardAccentColor = (
  indicators: WorkflowCardIndicator[],
): string | undefined => indicators[0]?.color;
