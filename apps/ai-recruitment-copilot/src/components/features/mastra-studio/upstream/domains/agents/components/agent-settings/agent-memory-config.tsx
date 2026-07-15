import type { SemanticRecall } from "@mastra/core/memory";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { useMemoryConfig } from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { resolveConditional } from "../../utils/conditional";

function formatMessageRange(value: number | { before: number; after: number } | undefined): string {
  if (typeof value === "object") {
    return `${value.before || 1} before, ${value.after || 1} after`;
  }
  return value === undefined ? "1 before, 1 after" : `${value} before, ${value} after`;
}

interface MemoryConfigSection {
  title: string;
  items: {
    label: string;
    value: MemoryConfigItemValue | undefined;
    badge?: MemoryConfigBadge;
  }[];
}

type MemoryConfigBadge = "success" | "info" | "warning";
type MemoryConfigItemValue = string | number | boolean;

interface AgentMemoryConfigProps {
  agentId: string;
}

interface DisplayMemoryConfig {
  lastMessages?: number | false;
  generateTitle?: boolean;
  semanticRecall?: SemanticRecall | boolean;
  observationalMemory?:
    | boolean
    | {
        enabled?: boolean;
        scope?: "resource" | "thread";
        model?: unknown;
        observationModel?: string;
        reflectionModel?: string;
        observation?: {
          model?: unknown;
          messageTokens?: number | { min: number; max: number };
        };
        reflection?: {
          model?: unknown;
          observationTokens?: number | { min: number; max: number };
        };
      };
}

const formatThreshold = (threshold: number | { min: number; max: number } | undefined) => {
  if (threshold === undefined) {
    return "默认";
  }
  if (typeof threshold === "number") {
    return `${threshold.toLocaleString()} Token`;
  }
  return `${threshold.min.toLocaleString()}–${threshold.max.toLocaleString()} Token`;
};

const badgeColors: Record<MemoryConfigBadge, string> = {
  info: "bg-blue-500/20 text-blue-400",
  success: "bg-green-500/20 text-green-400",
  warning: "bg-yellow-500/20 text-yellow-400",
};

function MemoryConfigValue({
  value,
  badge,
}: {
  value: MemoryConfigItemValue;
  badge?: MemoryConfigBadge;
}) {
  if (typeof value === "boolean") {
    return (
      <span
        className={cn(
          "text-xs font-medium px-2 py-0.5 rounded",
          resolveConditional(
            value,
            () =>
              badge === "info"
                ? "dark:bg-blue-500/20 dark:text-blue-400 bg-blue-500/10 text-blue-600"
                : "dark:bg-green-500/20 dark:text-green-400 bg-green-500/10 text-green-600",
            () => "dark:bg-red-500/20 dark:text-red-400 bg-red-500/10 text-red-600",
          ),
        )}
      >
        {value ? "是" : "否"}
      </span>
    );
  }

  if (badge) {
    return (
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded", badgeColors[badge])}>
        {value}
      </span>
    );
  }

  return <span className="text-xs text-neutral3">{value}</span>;
}

function getInfoBadge(enabled: boolean | undefined): MemoryConfigBadge | undefined {
  if (enabled) {
    return "info";
  }
  return undefined;
}

function buildGeneralSection(config: DisplayMemoryConfig): MemoryConfigSection {
  return {
    items: [
      { badge: "success", label: "已启用记忆", value: true },
      { label: "最近消息", value: config.lastMessages || 0 },
      {
        badge: getInfoBadge(config.generateTitle),
        label: "自动生成标题",
        value: Boolean(config.generateTitle),
      },
    ],
    title: "常规",
  };
}

function buildSemanticSection(
  semanticRecall: DisplayMemoryConfig["semanticRecall"],
): MemoryConfigSection | undefined {
  if (!semanticRecall) {
    return undefined;
  }
  const config = typeof semanticRecall === "object" ? semanticRecall : ({} as SemanticRecall);
  return {
    items: [
      { badge: "success", label: "已启用", value: true },
      { label: "作用域", value: config.scope || "resource" },
      { label: "Top K 结果数", value: config.topK || 4 },
      { label: "消息范围", value: formatMessageRange(config.messageRange) },
    ],
    title: "语义召回",
  };
}

type ObservationalMemoryConfig = Exclude<DisplayMemoryConfig["observationalMemory"], boolean>;

function buildObservationalSection(
  observationalMemory: DisplayMemoryConfig["observationalMemory"],
): MemoryConfigSection | undefined {
  if (!observationalMemory) {
    return undefined;
  }
  const config: ObservationalMemoryConfig =
    typeof observationalMemory === "object" ? observationalMemory : {};
  if (config.enabled === false) {
    return undefined;
  }
  const observationModel = config.observationModel || config.model || config.observation?.model;
  const reflectionModel = config.reflectionModel || config.model || config.reflection?.model;
  const items: MemoryConfigSection["items"] = [
    { badge: "success", label: "已启用", value: true },
    { label: "作用域", value: config.scope || "thread" },
    { label: "消息 Token 数", value: formatThreshold(config.observation?.messageTokens) },
    { label: "观测内容 Token 数", value: formatThreshold(config.reflection?.observationTokens) },
  ];
  if (observationModel) {
    items.push({ label: "观测模型", value: String(observationModel) });
  }
  if (reflectionModel) {
    items.push({ label: "反思模型", value: String(reflectionModel) });
  }
  return { items, title: "观测记忆" };
}

function buildConfigSections(config: DisplayMemoryConfig | undefined): MemoryConfigSection[] {
  if (!config) {
    return [];
  }
  return [
    buildGeneralSection(config),
    buildSemanticSection(config.semanticRecall),
    buildObservationalSection(config.observationalMemory),
  ].filter((section): section is MemoryConfigSection => section !== undefined);
}

export const AgentMemoryConfig = ({ agentId }: AgentMemoryConfigProps) => {
  const { data, isLoading } = useMemoryConfig(agentId);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["常规", "语义召回"]),
  );

  const config = data?.config as DisplayMemoryConfig | undefined;
  const configSections = useMemo(() => buildConfigSections(config), [config]);

  const toggleSection = (title: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(title)) {
      newExpanded.delete(title);
    } else {
      newExpanded.add(title);
    }
    setExpandedSections(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!config || configSections.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-medium text-neutral5 mb-3">记忆配置</h3>
        <p className="text-xs text-neutral3">暂无记忆配置</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-neutral5 mb-3">记忆配置</h3>
      <div className="space-y-2">
        {configSections.map((section) => (
          <div key={section.title} className="border border-border1 rounded-lg bg-surface3">
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface4 transition-colors rounded-t-lg"
            >
              <span className="text-xs font-medium text-neutral5">{section.title}</span>
              {expandedSections.has(section.title) ? (
                <ChevronDown className="w-3 h-3 text-neutral3" />
              ) : (
                <ChevronRight className="w-3 h-3 text-neutral3" />
              )}
            </button>
            {expandedSections.has(section.title) && (
              <div className="px-3 pb-2 space-y-1">
                {section.items.map((item) => (
                  <div
                    key={`${section.title}-${item.label}`}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-xs text-neutral3">{item.label}</span>
                    <MemoryConfigValue value={item.value ?? ""} badge={item.badge} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
