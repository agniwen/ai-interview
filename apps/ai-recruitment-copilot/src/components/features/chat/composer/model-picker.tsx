"use client";

import type { ChatModelOption } from "@/lib/client/api";
import { CheckIcon, ChevronDownIcon, CpuIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arc/shared/utils";
import { useChatModelsQuery } from "../lib/use-chat-models";
import { resolveEffectiveModel } from "../lib/resolve-effective-model";
import { useSessionModel } from "../lib/use-session-model";
import { useChatSessionContext } from "../chat-runtime-context";

const EMPTY_MODELS: readonly ChatModelOption[] = [];

// 厂商展示顺序：默认厂商（DeepSeek）置顶，其余按使用频率排，未知 other 兜底。
// Provider display order — default vendor first, others by rough popularity,
// unknown `other` last.
const PROVIDER_ORDER: ChatModelOption["provider"][] = [
  "deepseek",
  "alibaba",
  "moonshot",
  "zhipu",
  "minimax",
  "other",
];

const PROVIDER_LABEL: Record<ChatModelOption["provider"], string> = {
  alibaba: "通义千问",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  moonshot: "Kimi (Moonshot)",
  other: "其他",
  zhipu: "智谱 GLM",
};

const PROVIDER_LOGO_SLUG: Record<ChatModelOption["provider"], string | null> = {
  alibaba: "alibaba",
  deepseek: "deepseek",
  // models.dev 的智谱图标在 `zhipuai` 下；moonshot 在 `moonshotai`。
  // models.dev hosts Zhipu's logo under `zhipuai` and Moonshot under `moonshotai`.
  minimax: "minimax",
  moonshot: "moonshotai",
  // 未知厂商不渲染外链图标，避免 404 闪烁。
  // Unknown provider — skip the external logo to avoid 404 flicker.
  other: null,
  zhipu: "zhipuai",
};

function ProviderIcon({ provider }: { provider: ChatModelOption["provider"] }) {
  const slug = PROVIDER_LOGO_SLUG[provider];
  if (!slug) {
    return <CpuIcon className="size-3.5 text-muted-foreground" />;
  }
  return (
    // oxlint-disable-next-line next/no-img-element -- External SVG; next/image adds no value here and would require whitelisting models.dev.
    <img
      alt={`${provider} logo`}
      className="size-3.5 dark:invert"
      height={14}
      src={`https://models.dev/logos/${slug}.svg`}
      width={14}
    />
  );
}

interface ModelPickerProps {
  className?: string;
}

export function ModelPicker({ className }: ModelPickerProps) {
  const { data, isLoading, isError } = useChatModelsQuery();
  const [open, setOpen] = useState(false);
  const { chatId } = useChatSessionContext();
  const [selectedId, setSelectedId] = useSessionModel(chatId);

  // 稳定引用：`data?.models ?? []` 每次渲染都会产生新数组，会让下面 `useMemo` 的依赖
  // 永远变化。useMemo 后引用只在 fetch 真正回新数据时变化。
  // Stabilize: `data?.models ?? []` allocates a fresh array each render, churning
  // the memos below. Only flips when fetch returns new data.
  const models = useMemo(() => data?.models ?? EMPTY_MODELS, [data]);
  const defaultId = data?.defaultId ?? "";

  // 展示用的有效 id：先走兜底级联拿到"真实可用"id，空串再回退到 defaultId 给用户看。
  // 这一帧就给出最终值，避免出现"先闪 defaultId 再切 fallback"的抖动。
  // Display id: cascade first, then fallback to defaultId for the empty case.
  // Computed in a single pass so the trigger never flashes a stale value.
  const effectiveId = useMemo(() => {
    const resolved = resolveEffectiveModel({ defaultId, models, raw: selectedId });
    return resolved || defaultId;
  }, [defaultId, models, selectedId]);

  // /models 返回后，若 atom 里的 raw 不在新列表里 → 用同一套级联挑一个新的，
  // 同步写回 atom + 弹 toast 让用户知情；空串（"用默认"）不算"过期"，跳过。
  // After /models lands, if the atom-saved id is no longer in the list, run
  // the cascade and reconcile the atom + notify the user. Empty raw means
  // "use the server default" — that's never stale, skip.
  useEffect(() => {
    if (!data || !selectedId) {
      return;
    }
    if (data.models.some((m) => m.id === selectedId)) {
      return;
    }
    const resolved = resolveEffectiveModel({
      defaultId: data.defaultId,
      models: data.models,
      raw: selectedId,
    });
    // resolved 不可能是空串（raw 非空），但保险起见。
    // resolved cannot be empty here since raw isn't empty, guard anyway.
    const next = resolved || data.defaultId;
    setSelectedId(next === data.defaultId ? "" : next);
    toast.info(`原模型 ${selectedId} 已不可用，已切换到 ${next}`);
  }, [data, selectedId, setSelectedId]);

  const current = useMemo(
    () => models.find((m) => m.id === effectiveId) ?? null,
    [models, effectiveId],
  );

  // 按厂商分组，组内按 id 升序。
  // Group by provider, models inside each group sorted by id.
  const grouped = useMemo(() => {
    const buckets = new Map<ChatModelOption["provider"], ChatModelOption[]>();
    for (const model of models) {
      const list = buckets.get(model.provider) ?? [];
      list.push(model);
      buckets.set(model.provider, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return PROVIDER_ORDER.filter((p) => buckets.has(p)).map((provider) => ({
      items: buckets.get(provider) ?? [],
      provider,
    }));
  }, [models]);

  const triggerLabel = (() => {
    if (isLoading) {
      return "模型…";
    }
    if (isError || models.length === 0) {
      return "模型";
    }
    return current?.label ?? "选择模型";
  })();

  const handleSelect = (id: string) => {
    setSelectedId(id === defaultId ? "" : id);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label="选择模型"
              className={cn(
                "h-7 gap-1.5 rounded-md border-0 bg-transparent px-2 font-normal text-xs hover:bg-accent",
                className,
              )}
              disabled={isLoading || models.length === 0}
              size="sm"
              variant="ghost"
            >
              {current ? (
                <ProviderIcon provider={current.provider} />
              ) : (
                <CpuIcon className="size-3.5" />
              )}
              <span className="max-w-[180px] truncate font-mono">{triggerLabel}</span>
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">切换对话模型</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-80 p-0" sideOffset={6}>
        <Command
          // cmdk 默认按字符顺序排序匹配项；我们已经在 grouped 里按厂商分好序，
          // 关掉 sort 让分组顺序保持稳定。
          // cmdk's default sort would scramble our provider grouping; disable it
          // so the order we computed wins.
          shouldFilter
        >
          <CommandInput placeholder="搜索模型 id 或厂商..." />
          <CommandList>
            <CommandEmpty>未找到匹配的模型</CommandEmpty>
            {grouped.map(({ provider, items }) => (
              <CommandGroup heading={PROVIDER_LABEL[provider]} key={provider}>
                {items.map((model) => {
                  const isSelected = model.id === effectiveId;
                  return (
                    <CommandItem
                      // 让搜索除了匹配 id 外也能匹配厂商名（"kimi" → Moonshot 一组）。
                      // Extra keyword so searching for "kimi" / "通义" filters correctly.
                      keywords={[provider, PROVIDER_LABEL[provider]]}
                      key={model.id}
                      onSelect={() => handleSelect(model.id)}
                      value={model.id}
                    >
                      <ProviderIcon provider={model.provider} />
                      <span className="flex-1 truncate font-mono">{model.label}</span>
                      {model.id === defaultId && (
                        <span className="rounded-sm bg-primary/10 px-1 py-0 font-medium text-[9px] text-primary">
                          默认
                        </span>
                      )}
                      {isSelected && <CheckIcon className="size-3.5 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
