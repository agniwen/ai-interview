import { toast } from "@mastra/playground-ui/utils/toast";
import type { useMastraClient } from "@mastra/react";
import { resolveConditional } from "../../utils/conditional";
import { firstDefined } from "../../utils/presence";

export interface TestItem {
  input: unknown;
  output: unknown;
  expectedDirection: "high" | "low";
  label?: string;
}

function parseTargetIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function validateScorerFields(name: string, instructions: string): boolean {
  if (!name.trim()) {
    toast.error("Please enter a scorer name");
    return false;
  }
  if (!instructions.trim()) {
    toast.error("Please enter scorer instructions");
    return false;
  }
  return true;
}

export function resolveScorerModel(scorerModel: string, provider?: string, model?: string) {
  if (!scorerModel) {
    return { model, provider };
  }
  const [selectedProvider, ...modelParts] = scorerModel.split("/");
  return { model: modelParts.join("/"), provider: selectedProvider };
}

function mapDatasetItemToTestItem(item: {
  input?: unknown;
  groundTruth?: unknown;
  metadata?: unknown;
}): TestItem {
  const input = item.input as Record<string, unknown> | undefined;
  const groundTruth = item.groundTruth as Record<string, unknown> | undefined;
  const metadata = item.metadata as Record<string, unknown> | undefined;
  return {
    expectedDirection: resolveConditional(
      groundTruth?.expectedDirection === "low",
      () => "low" as const,
      () => "high" as const,
    ),
    input: firstDefined(input?.input, ""),
    label: metadata?.label as string | undefined,
    output: firstDefined(input?.output, ""),
  };
}

export async function findLinkedDatasetId(
  client: ReturnType<typeof useMastraClient>,
  scorerId: string,
): Promise<string | null> {
  try {
    const { datasets } = await client.listDatasets({ perPage: 200 });
    const linked = datasets.find((dataset) => {
      if (dataset.targetType !== "scorer") {
        return false;
      }
      return parseTargetIds(dataset.targetIds).includes(scorerId);
    });
    return linked?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadLinkedTestItems(
  client: ReturnType<typeof useMastraClient>,
  datasetId: string,
): Promise<TestItem[] | undefined> {
  try {
    const { items } = await client.listDatasetItems(datasetId, { perPage: 200 });
    return items.map(mapDatasetItemToTestItem);
  } catch {
    return undefined;
  }
}

export function getFallbackScorerValues(
  editScorerData: Record<string, unknown> | undefined,
  scorerId: string,
) {
  const scorer = editScorerData?.scorer as Record<string, unknown> | undefined;
  const config = scorer?.config as Record<string, unknown> | undefined;
  const judge = config?.judge as Record<string, unknown> | undefined;
  return {
    instructions: firstDefined(
      judge?.instructions as string | undefined,
      config?.instructions as string | undefined,
      "",
    ),
    model: judge?.model as string | undefined,
    name: firstDefined(
      config?.name as string | undefined,
      editScorerData?.name as string | undefined,
      scorerId,
    ),
  };
}

export interface ScorerMiniEditorProps {
  onBack: () => void;
  onSaved?: (scorerId: string) => void;
  initialItems?: { input: unknown; output: unknown; error: unknown; itemId: string }[];
  prefillTestItems?: { input: unknown; output: unknown; expectedDirection?: string }[];
  editScorerId?: string;
  editScorerData?: Record<string, unknown>;
}
