import { toast } from "@mastra/playground-ui/utils/toast";
import { createContext, useContext, useCallback, useState, useRef } from "react";
import type { ReactNode } from "react";

interface GeneratedItem {
  input: unknown;
  groundTruth?: unknown;
}

interface GenerationTask {
  datasetId: string;
  modelId: string;
  count: number;
  status: "generating" | "review-ready" | "error";
  startedAt: number;
  items?: GeneratedItem[];
  error?: string;
}

interface GenerationContextValue {
  /** Active generation tasks keyed by datasetId */
  tasks: Record<string, GenerationTask>;
  /** Start a new generation task */
  startGeneration: (opts: {
    datasetId: string;
    modelId: string;
    prompt: string;
    count: number;
    agentContext?: { description?: string; instructions?: string; tools?: string[] };
    generateFn: (params: {
      datasetId: string;
      modelId: string;
      prompt: string;
      count: number;
      agentContext?: { description?: string; instructions?: string; tools?: string[] };
    }) => Promise<{ items: GeneratedItem[] }>;
  }) => void;
  /** Dismiss a completed/errored task */
  dismissTask: (datasetId: string) => void;
  /** Get review-ready items for a dataset and clear them */
  consumeReviewItems: (datasetId: string) => GeneratedItem[] | null;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Record<string, GenerationTask>>({});
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const startGeneration = useCallback(
    ({
      datasetId,
      modelId,
      prompt,
      count,
      agentContext,
      generateFn,
    }: Parameters<GenerationContextValue["startGeneration"]>[0]) => {
      setTasks((prev) => ({
        ...prev,
        [datasetId]: {
          count,
          datasetId,
          modelId,
          startedAt: Date.now(),
          status: "generating",
        },
      }));

      const runGeneration = async () => {
        try {
          const result = await generateFn({ agentContext, count, datasetId, modelId, prompt });
          const items = result.items ?? [];
          setTasks((prev) => {
            const task = prev[datasetId];
            if (!task || task.status !== "generating") {
              return prev;
            }
            if (items.length === 0) {
              toast.info("生成完成，但未生成任何数据项。");
              const { [datasetId]: _, ...rest } = prev;
              return rest;
            }
            toast.success(`已生成 ${items.length} 个数据项。点击数据集进行评审。`);
            return {
              ...prev,
              [datasetId]: { ...task, items, status: "review-ready" },
            };
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          toast.error(`生成失败：${message}`);
          setTasks((prev) => {
            const task = prev[datasetId];
            if (!task) {
              return prev;
            }
            return {
              ...prev,
              [datasetId]: { ...task, error: message, status: "error" },
            };
          });
        }
      };

      void runGeneration();
    },
    [],
  );

  const dismissTask = useCallback((datasetId: string) => {
    setTasks((prev) => {
      const { [datasetId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const consumeReviewItems = useCallback((datasetId: string): GeneratedItem[] | null => {
    const task = tasksRef.current[datasetId];
    if (!task || task.status !== "review-ready" || !task.items) {
      return null;
    }
    const { items } = task;
    setTasks((prev) => {
      const { [datasetId]: _, ...rest } = prev;
      return rest;
    });
    return items;
  }, []);

  return (
    <GenerationContext.Provider value={{ consumeReviewItems, dismissTask, startGeneration, tasks }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGenerationTasks() {
  const ctx = useContext(GenerationContext);
  if (!ctx) {
    throw new Error("useGenerationTasks must be used within GenerationProvider");
  }
  return ctx;
}
