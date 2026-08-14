import { Button } from "@mastra/playground-ui/components/Button";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { Entry } from "@mastra/playground-ui/components/Entry";
import { Label } from "@mastra/playground-ui/components/Label";
import { Popover, PopoverContent, PopoverTrigger } from "@mastra/playground-ui/components/Popover";
import { RadioGroup, RadioGroupItem } from "@mastra/playground-ui/components/RadioGroup";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Slider } from "@mastra/playground-ui/components/Slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Info, Sliders } from "lucide-react";
import { useState } from "react";

import { useAgentSettings } from "../context/agent-context";
import { useAgent } from "../hooks/use-agent";
import { useSamplingRestriction } from "../hooks/use-sampling-restriction";
import { AgentAdvancedSettingsBody } from "./agent-advanced-settings";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useMemory } from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { resolveConditional } from "../utils/conditional";
import { withDefault } from "../utils/presence";
import { allTruthy, anyTruthy, isTruthy } from "../utils/truthiness";

export interface ComposerModelSettingsProps {
  agentId: string;
}

interface NetworkRadioProps {
  hasMemory: boolean;
  hasSubAgents: boolean;
  disabled: boolean;
}

const NetworkRadio = ({ hasMemory, hasSubAgents, disabled }: NetworkRadioProps) => {
  const isNetworkAvailable = allTruthy(hasMemory, hasSubAgents);
  const itemDisabled = anyTruthy(disabled, !isNetworkAvailable);

  const radio = (
    <div className="flex items-center gap-2">
      <RadioGroupItem
        value="network"
        id="network"
        className="text-neutral6"
        disabled={itemDisabled}
      />
      <Label
        className={cn(
          "text-neutral6 text-ui-md",
          !isNetworkAvailable && "text-neutral3! cursor-not-allowed",
        )}
        htmlFor="network"
      >
        网络
      </Label>
    </div>
  );

  if (isNetworkAvailable) {
    return radio;
  }

  const requirements: string[] = [];
  if (!hasMemory) {
    requirements.push("已启用记忆");
  }
  if (!hasSubAgents) {
    requirements.push("至少一个子智能体");
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{radio}</TooltipTrigger>
      <TooltipContent>
        <p>网络不可用。请确保{requirements.join("，并且")}。</p>
      </TooltipContent>
    </Tooltip>
  );
};

interface StreamSubscriptionRadioProps {
  supported: boolean;
  disabled: boolean;
}

interface RadioModelSettings {
  chatWithNetwork?: boolean;
  chatWithGenerate?: boolean;
  chatWithLegacyStream?: boolean;
  chatWithGenerateLegacy?: boolean;
}

function getRadioValue({
  hasAgent,
  isSupportedModel,
  modelSettings,
  supportsThreadSubscription,
}: {
  hasAgent: boolean;
  isSupportedModel: boolean;
  modelSettings: RadioModelSettings | undefined;
  supportsThreadSubscription: boolean;
}): string | undefined {
  if (!hasAgent) {
    return undefined;
  }
  if (!isSupportedModel) {
    return resolveConditional(
      modelSettings?.chatWithGenerateLegacy,
      () => "generateLegacy",
      () => "streamLegacy",
    );
  }
  if (modelSettings?.chatWithNetwork) {
    return "network";
  }
  if (modelSettings?.chatWithGenerate) {
    return "generate";
  }
  if (anyTruthy(modelSettings?.chatWithLegacyStream, !supportsThreadSubscription)) {
    return "stream";
  }
  return "streamSubscription";
}

function formatOptionalNumber(value: number | undefined): number | string {
  if (value === undefined) {
    return "不适用";
  }
  return value;
}

const StreamSubscriptionRadio = ({ supported, disabled }: StreamSubscriptionRadioProps) => {
  const itemDisabled = anyTruthy(disabled, !supported);

  const radio = (
    <div className="flex items-center gap-2">
      <RadioGroupItem
        value="streamSubscription"
        id="streamSubscription"
        className="text-neutral6"
        disabled={itemDisabled}
      />
      <Label
        className={cn(
          "text-neutral6 text-ui-md",
          !supported && "text-neutral3! cursor-not-allowed",
        )}
        htmlFor="streamSubscription"
      >
        流式订阅（默认）
      </Label>
    </div>
  );

  if (supported) {
    return radio;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{radio}</TooltipTrigger>
      <TooltipContent>
        <p>此智能体不支持流式订阅。</p>
      </TooltipContent>
    </Tooltip>
  );
};

export const ComposerModelSettings = ({ agentId }: ComposerModelSettingsProps) => {
  const { data: agent, isLoading } = useAgent(agentId);
  const { data: memory, isLoading: isMemoryLoading } = useMemory(agentId);
  const { settings, setSettings, resetAll } = useAgentSettings();
  const { canEdit } = usePermissions();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const canEditSettings = canEdit("agents");
  const modelSettings = settings?.modelSettings;

  const { hasSamplingRestriction } = useSamplingRestriction({
    modelId: agent?.modelId,
    provider: agent?.provider,
    setSettings,
    settings,
  });

  if (allTruthy(!isLoading, !agent)) {
    return null;
  }

  const hasMemory = Boolean(memory?.result);
  const hasSubAgents =
    Object.keys(withDefault<Record<string, { id: string; name: string }>>(agent?.agents, {}))
      .length > 0;
  const modelVersion = agent?.modelVersion;
  const isSupportedModel = anyTruthy(modelVersion === "v2", modelVersion === "v3");
  const supportsThreadSubscription = agent?.supportsMemory !== false;

  const radioValue = getRadioValue({
    hasAgent: Boolean(agent),
    isSupportedModel,
    modelSettings,
    supportsThreadSubscription,
  });

  const showSamplingBanner = anyTruthy(
    allTruthy(hasSamplingRestriction, modelSettings?.temperature !== undefined),
    modelSettings?.topP !== undefined,
  );

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open, details) => {
          // While the Advanced Settings dialog is open, ignore every popover
          // dismissal — outside-press, close button, focus loss, etc. The
          // dialog owns its own close lifecycle and is the only thing that
          // can dismiss the popover indirectly (by being closed first).
          if (!open && advancedOpen) {
            details?.cancel?.();
            return;
          }
          setPopoverOpen(open);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="default"
            size="icon-md"
            type="button"
            tooltip="模型设置"
            data-testid="composer-model-settings-trigger"
          >
            <Sliders className="h-5 w-5 text-neutral3 hover:text-neutral6" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-4">
          {resolveConditional(
            isLoading,
            (conditionValue) => conditionValue,
            () => isMemoryLoading,
          ) ? (
            <Skeleton className="h-40 w-full" data-testid="composer-model-settings-skeleton" />
          ) : (
            <section className="space-y-5 @container">
              <Entry label="对话方式">
                <RadioGroup
                  value={radioValue}
                  disabled={!canEditSettings}
                  onValueChange={(value: string) =>
                    canEditSettings &&
                    setSettings({
                      ...settings,
                      modelSettings: {
                        ...modelSettings,
                        chatWithGenerate: value === "generate",
                        chatWithGenerateLegacy: value === "generateLegacy",
                        chatWithLegacyStream: value === "stream",
                        chatWithNetwork: value === "network",
                      },
                    })
                  }
                  className="flex flex-col gap-3"
                >
                  {resolveConditional(
                    !isSupportedModel,
                    () => (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="generateLegacy"
                          id="generateLegacy"
                          className="text-neutral6"
                          disabled={!canEditSettings}
                        />
                        <Label className="text-neutral6 text-ui-md" htmlFor="generateLegacy">
                          生成（旧版）
                        </Label>
                      </div>
                    ),
                    () => null,
                  )}
                  {resolveConditional(
                    isSupportedModel,
                    () => (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="generate"
                          id="generate"
                          className="text-neutral6"
                          disabled={!canEditSettings}
                        />
                        <Label className="text-neutral6 text-ui-md" htmlFor="generate">
                          生成
                        </Label>
                      </div>
                    ),
                    () => null,
                  )}
                  {resolveConditional(
                    !isSupportedModel,
                    () => (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="streamLegacy"
                          id="streamLegacy"
                          className="text-neutral6"
                          disabled={!canEditSettings}
                        />
                        <Label className="text-neutral6 text-ui-md" htmlFor="streamLegacy">
                          流式（旧版）
                        </Label>
                      </div>
                    ),
                    () => null,
                  )}
                  {resolveConditional(
                    isSupportedModel,
                    () => (
                      <StreamSubscriptionRadio
                        supported={supportsThreadSubscription}
                        disabled={!canEditSettings}
                      />
                    ),
                    () => null,
                  )}
                  {resolveConditional(
                    isSupportedModel,
                    () => (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="stream"
                          id="stream"
                          className="text-neutral6"
                          disabled={!canEditSettings}
                        />
                        <Label className="text-neutral6 text-ui-md" htmlFor="stream">
                          流式
                        </Label>
                      </div>
                    ),
                    () => null,
                  )}
                  {resolveConditional(
                    isSupportedModel,
                    () => (
                      <NetworkRadio
                        hasMemory={hasMemory}
                        hasSubAgents={hasSubAgents}
                        disabled={!canEditSettings}
                      />
                    ),
                    () => null,
                  )}
                </RadioGroup>
              </Entry>

              <Entry label="工具调用需要批准">
                <Checkbox
                  checked={modelSettings?.requireToolApproval}
                  disabled={!canEditSettings}
                  onCheckedChange={(value) =>
                    canEditSettings &&
                    setSettings({
                      ...settings,
                      modelSettings: {
                        ...modelSettings,
                        requireToolApproval: value as boolean,
                      },
                    })
                  }
                />
              </Entry>

              {resolveConditional(
                showSamplingBanner,
                () => (
                  <div
                    className="flex items-center gap-2 text-xs text-neutral3 bg-surface3 rounded px-3 py-2"
                    data-testid="sampling-restriction-banner"
                  >
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isTruthy(modelSettings?.temperature !== undefined)
                        ? "Claude 4.5+ 模型仅接受 Temperature 或 Top P。清除 Temperature 后才能使用 Top P。"
                        : "Claude 4.5+ 模型仅接受 Temperature 或 Top P。设置 Temperature 会清除 Top P。"}
                    </span>
                  </div>
                ),
                () => null,
              )}

              <Entry label="温度">
                <div className="flex flex-row justify-between items-center gap-2">
                  <Slider
                    value={[withDefault(modelSettings?.temperature, -0.1)]}
                    max={1}
                    min={-0.1}
                    step={0.1}
                    disabled={!canEditSettings}
                    onValueChange={(value) =>
                      canEditSettings &&
                      setSettings({
                        ...settings,
                        modelSettings: {
                          ...modelSettings,
                          temperature: value[0] < 0 ? undefined : value[0],
                        },
                      })
                    }
                  />
                  <Txt as="p" variant="ui-sm" className="text-neutral3">
                    {formatOptionalNumber(modelSettings?.temperature)}
                  </Txt>
                </div>
              </Entry>

              <Entry label="Top P">
                <div className="flex flex-row justify-between items-center gap-2">
                  <Slider
                    disabled={!canEditSettings}
                    onValueChange={(value) =>
                      canEditSettings &&
                      setSettings({
                        ...settings,
                        modelSettings: {
                          ...modelSettings,
                          topP: value[0] < 0 ? undefined : value[0],
                        },
                      })
                    }
                    value={[withDefault(modelSettings?.topP, -0.1)]}
                    max={1}
                    min={-0.1}
                    step={0.1}
                  />
                  <Txt as="p" variant="ui-sm" className="text-neutral3">
                    {formatOptionalNumber(modelSettings?.topP)}
                  </Txt>
                </div>
              </Entry>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={!canEditSettings}
                  onClick={() => canEditSettings && resetAll()}
                >
                  重置
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  type="button"
                  disabled={!canEditSettings}
                  onClick={() => setAdvancedOpen(true)}
                >
                  高级设置
                </Button>
              </div>
            </section>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>高级模型设置</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AgentAdvancedSettingsBody canEdit={canEditSettings} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};
