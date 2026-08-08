import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  MeetingTranscriptionPolicy,
  MeetingTranscriptionProviderId,
  UpdateMeetingTranscriptionPolicyInput,
} from "@arc/shared/meeting-transcription";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  desktopMeetingKeys,
  fetchMeetingTranscriptionPolicy,
  updateMeetingTranscriptionPolicy,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";

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
  const [selectedProvider, setSelectedProvider] = useState(policy.selectedProvider);
  useEffect(() => {
    setAllowedProviders(policy.allowedProviders);
    setSelectedProvider(policy.selectedProvider);
  }, [policy]);
  const setAllowed = (provider: MeetingTranscriptionProviderId, allowed: boolean) => {
    setAllowedProviders((current) =>
      allowed ? [...new Set([...current, provider])] : current.filter((item) => item !== provider),
    );
    if (!allowed && selectedProvider === provider) {
      setSelectedProvider(null);
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
        description="选择用于新 Final Transcript 的 provider；不会静默回退。"
        htmlFor="meeting-transcription-selected-provider"
        label="Final Transcript provider"
      >
        <select
          className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
          disabled={!policy.canManage || allowedProviders.length === 0}
          id="meeting-transcription-selected-provider"
          onChange={(event) =>
            setSelectedProvider(
              (event.target.value || null) as MeetingTranscriptionProviderId | null,
            )
          }
          value={selectedProvider ?? ""}
        >
          <option value="">未选择</option>
          {policy.availableProviders
            .filter((provider) => allowedProviders.includes(provider.id))
            .map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
        </select>
      </SettingsRow>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <p className="text-muted-foreground text-xs">
          {policy.canManage
            ? `策略 revision ${policy.revision}`
            : "只有 Workspace Administrator 可以修改"}
        </p>
        {policy.canManage ? (
          <Button
            disabled={saving}
            onClick={() => onSave({ allowedProviders, selectedProvider })}
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
