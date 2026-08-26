"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { interviewNotificationKeys } from "@/lib/client/api/query-keys";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface WorkspaceMember {
  email: string;
  feishuProviderIds: string[];
  id: string;
  image: string | null;
  name: string;
}

interface NotificationRecipient {
  email: string;
  feishuBound: boolean;
  feishuProviderIds: string[];
  image: string | null;
  name: string;
  userId: string;
}

interface NotificationRecipientsResponse {
  fallbackToInitiator: boolean;
  records: NotificationRecipient[];
}

interface WorkspaceMembersResponse {
  feishuHumanInterviewEnabled: boolean;
  records: WorkspaceMember[];
}

interface EditorProps {
  candidateId: string;
  disabled: boolean;
  initialRecipients: NotificationRecipientsResponse;
  members: WorkspaceMember[];
  slug: string;
}

function sameUserIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function NotificationRecipientsEditor({
  candidateId,
  disabled,
  initialRecipients,
  members,
  slug,
}: EditorProps) {
  const queryClient = useQueryClient();
  const initialUserIds = initialRecipients.records.map((record) => record.userId);
  const [selectedUserIds, setSelectedUserIds] = useState(initialUserIds);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const unboundSelectedCount = selectedUserIds.filter(
    (userId) => membersById.get(userId)?.feishuProviderIds.length === 0,
  ).length;
  const mutation = useMutation({
    mutationFn: () =>
      rpcFetch<NotificationRecipientsResponse>(
        rpc.api.w[":slug"].studio.interviews[":interviewRecordId"]["notification-recipients"].$put({
          json: { userIds: selectedUserIds },
          param: { interviewRecordId: candidateId, slug },
        }),
        "保存通知人员失败",
      ),
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存通知人员失败"),
    onSuccess: (data) => {
      queryClient.setQueryData(interviewNotificationKeys.recipients(slug, candidateId), data);
      toast.success(data.fallbackToInitiator ? "已改为通知本次面试发起人" : "通知人员已保存");
    },
  });
  const options = members.map((member) => ({
    avatarUrl: member.image,
    description:
      member.feishuProviderIds.length > 0
        ? `${member.email} · 飞书已绑定`
        : `${member.email} · 未绑定飞书`,
    label: member.name,
    value: member.id,
  }));

  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor="interview-notification-recipients">飞书通知人员</FieldLabel>
          {unboundSelectedCount > 0 ? (
            <Badge variant="destructive">{unboundSelectedCount} 人未绑定飞书</Badge>
          ) : null}
        </div>
        <Button
          disabled={disabled || mutation.isPending || sameUserIds(selectedUserIds, initialUserIds)}
          onClick={() => mutation.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconDeviceFloppy data-icon="inline-start" />
          {mutation.isPending ? "保存中" : "保存"}
        </Button>
      </div>
      <SearchableMultiSelect
        disabled={disabled || mutation.isPending}
        emptyMessage="找不到匹配的工作区成员"
        id="interview-notification-recipients"
        onChange={setSelectedUserIds}
        options={options}
        placeholder="未选择时通知本次面试发起人"
        searchPlaceholder="搜索姓名或邮箱"
        selectedFormat={(count) => `已选 ${count} 位通知人员`}
        selectedPreviewLimit={2}
        value={selectedUserIds}
      />
      <FieldDescription>
        {unboundSelectedCount > 0
          ? "未绑定飞书的已选人员不会静默回退给发起人，请先让其完成飞书登录绑定。"
          : "显式选择优先；不选择时通知本次面试发起人。"}
      </FieldDescription>
    </Field>
  );
}

export function InterviewNotificationRecipientsField({
  candidateId,
  disabled = false,
}: {
  candidateId: string;
  disabled?: boolean;
}) {
  const slug = useWorkspaceSlug();
  const recipientsQuery = useQuery({
    queryFn: () =>
      rpcFetch<NotificationRecipientsResponse>(
        rpc.api.w[":slug"].studio.interviews[":interviewRecordId"]["notification-recipients"].$get({
          param: { interviewRecordId: candidateId, slug },
        }),
        "加载通知人员失败",
      ),
    queryKey: interviewNotificationKeys.recipients(slug, candidateId),
    staleTime: 30_000,
  });
  const membersQuery = useQuery({
    queryFn: () =>
      rpcFetch<WorkspaceMembersResponse>(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: interviewNotificationKeys.workspaceMembers(slug),
    staleTime: 60_000,
  });

  if (recipientsQuery.isLoading || membersQuery.isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (recipientsQuery.isError || membersQuery.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        通知人员加载失败，请刷新后重试。
      </p>
    );
  }
  const recipients = recipientsQuery.data;
  const members = membersQuery.data?.records;
  if (!(recipients && members)) {
    return null;
  }
  const editorKey = recipients.records
    .map((record) => record.userId)
    .toSorted()
    .join(":");
  return (
    <NotificationRecipientsEditor
      candidateId={candidateId}
      disabled={disabled}
      initialRecipients={recipients}
      key={editorKey}
      members={members}
      slug={slug}
    />
  );
}
