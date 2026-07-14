import {
  Timer,
  CalendarClock,
  List,
  Workflow,
  PlayCircle,
  Network,
  Repeat,
  RefreshCw,
  GitBranch,
  CornerDownRight,
  Repeat1,
  Clock,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Badge colors for different node types
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

// Badge icons for different node types
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

export const getConditionIconAndColor = (type: string): ConditionIconConfig => {
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
    default: {
      return { color: undefined, icon: undefined };
    }
  }
};

export interface NodeBadgeInfo {
  isSleepNode: boolean;
  isForEachNode: boolean;
  isMapNode: boolean;
  isNestedWorkflow: boolean;
  hasSpecialBadge: boolean;
}

export const getNodeBadgeInfo = (data: {
  duration?: number;
  date?: Date;
  isForEach?: boolean;
  mapConfig?: string;
  canSuspend?: boolean;
  isParallel?: boolean;
  stepGraph?: unknown;
}): NodeBadgeInfo => {
  const isSleepNode = Boolean(data.duration || data.date);
  const isForEachNode = Boolean(data.isForEach);
  const isMapNode = Boolean(data.mapConfig && !data.isForEach);
  const isNestedWorkflow = Boolean(data.stepGraph);
  const hasSpecialBadge =
    isSleepNode ||
    data.canSuspend ||
    data.isParallel ||
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
