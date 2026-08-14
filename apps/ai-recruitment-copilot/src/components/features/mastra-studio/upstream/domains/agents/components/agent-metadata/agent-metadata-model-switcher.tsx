import type { UpdateModelParams } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Lock, RotateCcw } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useModelReset } from "../../context/model-reset-context";
import { useBuilderModelPolicy } from "@/components/features/mastra-studio/upstream/domains/agent-builder";
import { useAgentBuilderAllowedModels } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-agent-builder-allowed-models";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { useLLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/hooks/use-llm-providers";
import {
  cleanProviderId,
  findProviderById,
} from "@/components/features/mastra-studio/upstream/domains/llm/utils";
import { resolveConditional } from "../../utils/conditional";

export interface AgentMetadataModelSwitcherProps {
  defaultProvider: string;
  defaultModel: string;
  updateModel: (newModel: UpdateModelParams) => Promise<{ message: string }>;
  resetModel?: () => Promise<{ message: string }>;
  closeEditor?: () => void;
  autoSave?: boolean;
  selectProviderPlaceholder?: string;
}

export const AgentMetadataModelSwitcher = ({
  defaultProvider,
  defaultModel,
  updateModel,
  resetModel,
}: AgentMetadataModelSwitcherProps) => {
  const [originalProvider] = useState(defaultProvider);
  const [originalModel] = useState(defaultModel);

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider || "");
  const [loading, setLoading] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const { data: dataProviders, isLoading: providersLoading } = useLLMProviders();
  const policy = useBuilderModelPolicy();
  const { models: allowedModels } = useAgentBuilderAllowedModels();

  const providers = useMemo(() => dataProviders?.providers || [], [dataProviders]);

  // Update local state when default props change (e.g., after reset)
  useEffect(() => {
    setSelectedModel(defaultModel);
    setSelectedProvider(defaultProvider || "");
  }, [defaultModel, defaultProvider]);

  const currentModelProvider = cleanProviderId(selectedProvider);

  // Resolve the full provider ID (handles gateway prefix, e.g., 'custom' -> 'acme/custom')
  const resolvedProvider = findProviderById(providers, currentModelProvider);
  const fullProviderId = resolvedProvider?.id || currentModelProvider;

  // Auto-save when model changes
  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);

    if (modelId && fullProviderId) {
      setLoading(true);
      try {
        const result = await updateModel({
          modelId,
          provider: fullProviderId as UpdateModelParams["provider"],
        });
        console.info("Model updated:", result);
      } catch (error) {
        console.error("Failed to update model:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle provider selection
  const handleProviderSelect = (providerId: string) => {
    const cleanedId = cleanProviderId(providerId);
    setSelectedProvider(cleanedId);

    // Only clear model selection and open model combobox when switching to a different provider
    if (cleanedId !== currentModelProvider) {
      setSelectedModel("");
      setModelOpen(true);
    }
  };

  // Get the model reset context
  const { registerResetFn } = useModelReset();

  // Register reset callback with context
  useEffect(() => {
    const resetIfIncomplete = async () => {
      // Don't reset if either picker is currently open
      if (providerOpen || modelOpen) {
        return;
      }

      // Check if provider changed but no model selected
      const providerChanged = currentModelProvider && currentModelProvider !== originalProvider;
      const modelEmpty = !selectedModel || selectedModel === "";

      if (providerChanged && modelEmpty) {
        // Reset to original values
        setSelectedProvider(cleanProviderId(originalProvider));
        setSelectedModel(originalModel);

        // Update back to original configuration - resolve full provider ID
        const resolvedOriginalProvider = findProviderById(providers, originalProvider);
        const fullOriginalProviderId = resolvedOriginalProvider?.id || originalProvider;
        if (fullOriginalProviderId && originalModel) {
          try {
            await updateModel({
              modelId: originalModel,
              provider: fullOriginalProviderId as UpdateModelParams["provider"],
            });
          } catch (error) {
            console.error("Failed to reset model:", error);
          }
        }
      }
    };

    registerResetFn(resetIfIncomplete);

    // Cleanup on unmount
    return () => {
      registerResetFn(null);
    };
  }, [
    registerResetFn,
    currentModelProvider,
    selectedModel,
    originalProvider,
    originalModel,
    updateModel,
    providerOpen,
    modelOpen,
    providers,
  ]);

  if (providersLoading) {
    return (
      <div className="flex items-center gap-2">
        <Spinner />
        <span className="text-sm text-gray-500">正在加载提供商…</span>
      </div>
    );
  }

  // Handle reset button click - resets to the ORIGINAL model
  const handleReset = async () => {
    if (!resetModel) {
      console.warn("Reset model function not provided");
      return;
    }

    // Call the reset endpoint to restore the original model
    try {
      setLoading(true);
      await resetModel();
      // After reset, the agent will be re-fetched with the original model
      // which will update the defaultProvider and defaultModel props
    } catch (error) {
      console.error("Failed to reset model:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentProvider = findProviderById(providers, currentModelProvider);

  // Admin locked the picker — surface a non-interactive chip instead.
  if (policy.active && policy.pickerVisible === false) {
    const lockedProvider = policy.default?.provider;
    const lockedModel = policy.default?.modelId;
    const selectedLabel =
      selectedProvider && selectedModel ? `${selectedProvider}/${selectedModel}` : "已由管理员锁定";
    const lockedLabel =
      lockedProvider && lockedModel ? `${lockedProvider}/${lockedModel}` : selectedLabel;
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border1 bg-surface3 px-3 py-2"
        data-testid="agent-metadata-model-locked"
      >
        <Lock className="h-4 w-4 shrink-0 text-neutral3" />
        <span className="truncate text-ui-sm text-neutral6">{lockedLabel}</span>
        <span className="ml-auto shrink-0 text-ui-xs text-neutral3">由管理员设置</span>
      </div>
    );
  }

  const stale =
    Boolean(currentModelProvider && selectedModel) &&
    policy.active &&
    policy.allowed !== undefined &&
    !allowedModels.some(
      (m) => cleanProviderId(m.provider) === currentModelProvider && m.model === selectedModel,
    );

  return (
    <div className="@container">
      <div className="flex flex-col @xs:flex-row items-stretch @xs:items-center gap-2 w-full">
        <div className="w-full @xs:w-2/5">
          <LLMProviders
            value={currentModelProvider}
            onValueChange={handleProviderSelect}
            open={providerOpen}
            onOpenChange={setProviderOpen}
          />
        </div>

        <div className="w-full @xs:w-3/5">
          <LLMModels
            llmId={currentModelProvider}
            value={selectedModel}
            onValueChange={handleModelSelect}
            open={modelOpen}
            onOpenChange={setModelOpen}
          />
        </div>

        <Button
          variant="default"
          size="md"
          onClick={handleReset}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs whitespace-nowrap border-0!"
          title="重置为原始模型"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {resolveConditional(
        stale,
        () => (
          <div className="pt-2 p-2" data-testid="agent-metadata-model-stale-warning">
            <Notice variant="warning" title="不允许使用此模型">
              <Notice.Message>
                <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 rounded">
                  {selectedProvider}/{selectedModel}
                </code>{" "}
                已不符合管理员策略。请选择其他模型后再保存更改。
              </Notice.Message>
            </Notice>
          </div>
        ),
        () => null,
      )}

      {/* Show warning if selected provider is not connected */}
      {resolveConditional(
        currentProvider,
        (provider) =>
          resolveConditional(
            !provider.connected,
            () => (
              <div className="pt-2 p-2">
                <Notice variant="warning" title="提供商未连接">
                  <Notice.Message>
                    请设置{" "}
                    <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 rounded">
                      {Array.isArray(provider.envVar)
                        ? provider.envVar.join(", ")
                        : provider.envVar}
                    </code>{" "}
                    环境{" "}
                    {Array.isArray(provider.envVar) && provider.envVar.length > 1 ? "变量" : "变量"}{" "}
                    以使用此提供商。
                  </Notice.Message>
                </Notice>
              </div>
            ),
            () => null,
          ),
        () => null,
      )}
    </div>
  );
};
