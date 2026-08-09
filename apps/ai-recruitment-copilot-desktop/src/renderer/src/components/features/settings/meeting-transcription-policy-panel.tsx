import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  MeetingTranscriptionPolicy,
  MeetingTranscriptionProviderId,
  UpdateMeetingTranscriptionPolicyInput,
} from "@arc/shared/meeting-transcription";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  desktopMeetingKeys,
  fetchMeetingTranscriptionPolicy,
  updateMeetingTranscriptionPolicy,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";

/**
 * Final Transcript 策略的本地工作副本，维护 allowed、selected 与 fallback 三者的联动不变量。
 * Local working copy for Final Transcript policy, preserving invariants among allowed, selected, and fallback providers.
 */
export function MeetingTranscriptionPolicyView({
  onSave,
  policy,
  saving,
}: {
  onSave: (input: UpdateMeetingTranscriptionPolicyInput) => void;
  policy: MeetingTranscriptionPolicy;
  saving: boolean;
}) {
  const [allowedProviders, setAllowedProviders] = useState(policy.allowedProviders);
  const [fallbackProvider, setFallbackProvider] = useState(policy.fallbackProvider);
  const [selectionReason, setSelectionReason] = useState(policy.selectionReason ?? "");
  const [selectedProvider, setSelectedProvider] = useState(policy.selectedProvider);
  useEffect(() => {
    setAllowedProviders(policy.allowedProviders);
    setFallbackProvider(policy.fallbackProvider);
    setSelectionReason(policy.selectionReason ?? "");
    setSelectedProvider(policy.selectedProvider);
  }, [policy]);
  const setAllowed = (provider: MeetingTranscriptionProviderId, allowed: boolean) => {
    setAllowedProviders((current) =>
      allowed ? [...new Set([...current, provider])] : current.filter((item) => item !== provider),
    );
    if (!allowed && selectedProvider === provider) {
      // 被禁止的 Provider 不能继续作为默认或 fallback，也不能保留误导性的选择理由。
      // A disallowed provider cannot remain selected/fallback or retain a misleading selection reason.
      setSelectedProvider(null);
      setFallbackProvider(null);
      setSelectionReason("");
    }
    if (!allowed && fallbackProvider === provider) {
      setFallbackProvider(null);
    }
  };

  if (policy.availableProviders.length === 0) {
    return (
      <SettingsGroup>
        <SettingsRow
          description="请先在服务端启用至少一个受支持的 Final Transcript provider。"
          label="Final Meeting Transcript"
        >
          <p className="text-muted-foreground text-right text-xs">当前部署没有可用 provider</p>
        </SettingsRow>
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup>
      {policy.availableProviders.map((provider) => (
        <SettingsRow
          description={`${provider.model} · ${provider.region}`}
          htmlFor={`meeting-transcription-${provider.id}`}
          key={provider.id}
          label={`允许使用 ${provider.label}`}
        >
          <div className="flex justify-end">
            <Switch
              checked={allowedProviders.includes(provider.id)}
              disabled={!policy.canManage}
              id={`meeting-transcription-${provider.id}`}
              onCheckedChange={(checked) => setAllowed(provider.id, checked)}
            />
          </div>
        </SettingsRow>
      ))}
      <SettingsRow
        description="选择用于新 Final Transcript 的默认 provider。"
        htmlFor="meeting-transcription-selected-provider"
        label="Final Transcript provider"
      >
        <Select
          disabled={!policy.canManage || allowedProviders.length === 0}
          onValueChange={(value) => {
            const next = value === "none" ? null : (value as MeetingTranscriptionProviderId);
            setSelectedProvider(next);
            if (!next) {
              setFallbackProvider(null);
              setSelectionReason("");
            } else if (fallbackProvider === next) {
              setFallbackProvider(null);
            }
          }}
          value={selectedProvider ?? "none"}
        >
          <SelectTrigger className="w-full" id="meeting-transcription-selected-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">未选择</SelectItem>
            {policy.availableProviders
              .filter((provider) => allowedProviders.includes(provider.id))
              .map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        description="默认 provider 失败后可显式转给另一个已允许 provider；不设置则不回退。"
        htmlFor="meeting-transcription-fallback-provider"
        label="Fallback provider"
      >
        <Select
          disabled={!policy.canManage || !selectedProvider}
          onValueChange={(value) =>
            setFallbackProvider(value === "none" ? null : (value as MeetingTranscriptionProviderId))
          }
          value={fallbackProvider ?? "none"}
        >
          <SelectTrigger className="w-full" id="meeting-transcription-fallback-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不自动回退</SelectItem>
            {policy.availableProviders
              .filter(
                (provider) =>
                  allowedProviders.includes(provider.id) && provider.id !== selectedProvider,
              )
              .map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        description="记录本次 corpus run、区域、质量、删除和实际费用为何支持这个选择。"
        htmlFor="meeting-transcription-selection-reason"
        label="选择理由"
      >
        <Textarea
          disabled={!policy.canManage || !selectedProvider}
          id="meeting-transcription-selection-reason"
          maxLength={500}
          onChange={(event) => setSelectionReason(event.target.value)}
          placeholder="例如：consented-corpus-v1 中中文 CER 最低，且满足中国大陆数据驻留要求。"
          value={selectionReason}
        />
      </SettingsRow>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Final 默认值不影响实时草稿；实时草稿当前使用允许列表中的 OpenAI。
          </p>
          <p className="text-muted-foreground text-xs">
            {policy.canManage
              ? `策略 revision ${policy.revision}`
              : "只有 Workspace Administrator 可以修改"}
          </p>
        </div>
        {policy.canManage ? (
          <Button
            disabled={saving || Boolean(selectedProvider && selectionReason.trim().length < 10)}
            onClick={() =>
              onSave({
                allowedProviders,
                fallbackProvider,
                selectedProvider,
                selectionReason: selectedProvider ? selectionReason.trim() : null,
              })
            }
            size="sm"
            type="button"
          >
            {saving ? "正在保存…" : "保存转录策略"}
          </Button>
        ) : null}
      </div>
    </SettingsGroup>
  );
}

/**
 * Workspace 级转录策略容器；只有管理员可写，服务端更新 revision 并使旧策略下的运行失效。
 * Workspace transcription-policy container; admins write while the server revisions policy and invalidates stale runs.
 */
export function MeetingTranscriptionPolicyPanel() {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 30_000,
  });
  const workspace = workspaceQuery.data;
  const policyKey = desktopMeetingKeys.transcriptionPolicy(workspace?.slug ?? "");
  const policyQuery = useQuery({
    enabled: Boolean(workspace),
    queryFn: () => fetchMeetingTranscriptionPolicy(workspace?.slug ?? ""),
    queryKey: policyKey,
  });
  const mutation = useMutation({
    mutationFn: (input: UpdateMeetingTranscriptionPolicyInput) =>
      updateMeetingTranscriptionPolicy(workspace?.slug ?? "", input),
    onSuccess: (policy) => queryClient.setQueryData(policyKey, policy),
  });
  const error = workspaceQuery.error ?? policyQuery.error ?? mutation.error;
  if (workspaceQuery.isPending || policyQuery.isPending) {
    return <p className="text-muted-foreground text-sm">正在加载最终转录策略…</p>;
  }
  if (!workspace) {
    return <p className="text-muted-foreground text-sm">请先加入 Workspace。</p>;
  }
  if (error) {
    return (
      <p className="text-destructive text-sm">
        {error instanceof Error ? error.message : "加载最终转录策略失败"}
      </p>
    );
  }
  return policyQuery.data ? (
    <MeetingTranscriptionPolicyView
      onSave={(input) => mutation.mutate(input)}
      policy={policyQuery.data}
      saving={mutation.isPending}
    />
  ) : null;
}
