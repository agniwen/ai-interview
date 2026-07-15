import { Button } from "@mastra/playground-ui/components/Button";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { RadioGroup, RadioGroupItem } from "@mastra/playground-ui/components/RadioGroup";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check, Save } from "lucide-react";
import type { RefObject } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

import type { ScorerFormValues } from "./utils/form-validation";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";

interface ScorerEditSidebarProps {
  form: UseFormReturn<ScorerFormValues>;
  onPublish: () => void;
  onSaveDraft?: () => void;
  isSubmitting?: boolean;
  isSavingDraft?: boolean;
  formRef?: RefObject<HTMLFormElement | null>;
  mode?: "create" | "edit";
}

export function ScorerEditSidebar({
  form,
  onPublish,
  onSaveDraft,
  isSubmitting = false,
  isSavingDraft = false,
  formRef,
  mode = "create",
}: ScorerEditSidebarProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;

  const watchedSamplingType = useWatch({ control, name: "defaultSampling.type" });
  const watchedProvider = useWatch({ control, name: "model.provider" });

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-6 p-4">
          <SectionHeader title="配置" subtitle="定义评分器的名称、类型和设置。" />

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scorer-name" className="text-xs text-neutral5">
              名称 <span className="text-accent2">*</span>
            </Label>
            <Input
              id="scorer-name"
              placeholder="我的评分器"
              variant="outline"
              {...register("name")}
              error={!!errors.name}
            />
            {errors.name && <span className="text-xs text-accent2">{errors.name.message}</span>}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scorer-description" className="text-xs text-neutral5">
              描述 <span className="text-accent2">*</span>
            </Label>
            <Textarea
              id="scorer-description"
              placeholder="描述此评分器的用途"
              variant="outline"
              {...register("description")}
              error={!!errors.description}
            />
            {errors.description && (
              <span className="text-xs text-accent2">{errors.description.message}</span>
            )}
          </div>

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-neutral5">
              提供商 <span className="text-accent2">*</span>
            </Label>
            <Controller
              name="model.provider"
              control={control}
              render={({ field }) => (
                <LLMProviders
                  value={field.value}
                  onValueChange={field.onChange}
                  container={formRef}
                />
              )}
            />
            {errors.model?.provider && (
              <span className="text-xs text-accent2">{errors.model.provider.message}</span>
            )}
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-neutral5">
              模型 <span className="text-accent2">*</span>
            </Label>
            <Controller
              name="model.name"
              control={control}
              render={({ field }) => (
                <LLMModels
                  value={field.value}
                  onValueChange={field.onChange}
                  llmId={watchedProvider || ""}
                  container={formRef}
                />
              )}
            />
            {errors.model?.name && (
              <span className="text-xs text-accent2">{errors.model.name.message}</span>
            )}
          </div>

          {/* Score Range */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-neutral5">得分范围</Label>
            <div className="flex gap-2 items-center">
              <Controller
                name="scoreRange.min"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="最小值"
                    variant="outline"
                    value={field.value}
                    onChange={(e) => field.onChange(Number.parseFloat(e.target.value) || 0)}
                  />
                )}
              />
              <span className="text-xs text-neutral3">至</span>
              <Controller
                name="scoreRange.max"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="最大值"
                    variant="outline"
                    value={field.value}
                    onChange={(e) => field.onChange(Number.parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            </div>
          </div>

          {/* Default Sampling */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-neutral5">默认采样</Label>
            <Controller
              name="defaultSampling.type"
              control={control}
              render={({ field }) => (
                <RadioGroup value={field.value ?? "none"} onValueChange={field.onChange}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="sampling-none" />
                    <Label htmlFor="sampling-none" className="text-xs text-neutral5">
                      无
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ratio" id="sampling-ratio" />
                    <Label htmlFor="sampling-ratio" className="text-xs text-neutral5">
                      比例
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
            {watchedSamplingType === "ratio" && (
              <Controller
                name="defaultSampling.rate"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    placeholder="比率（0–1）"
                    variant="outline"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number.parseFloat(e.target.value) || 0)}
                  />
                )}
              />
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Sticky footer */}
      <div className="shrink-0 p-4">
        {mode === "edit" && onSaveDraft ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="flex-1"
            >
              {isSavingDraft ? (
                <>
                  <Spinner className="h-4 w-4" />
                  正在保存...
                </>
              ) : (
                <>
                  <Icon>
                    <Save />
                  </Icon>
                  保存
                </>
              )}
            </Button>
            <Button
              variant="primary"
              onClick={onPublish}
              disabled={isSubmitting || isSavingDraft}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  正在发布...
                </>
              ) : (
                <>
                  <Icon>
                    <Check />
                  </Icon>
                  发布
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={onPublish} disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4" />
                正在创建...
              </>
            ) : (
              <>
                <Icon>
                  <Check />
                </Icon>
                创建评分器
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
