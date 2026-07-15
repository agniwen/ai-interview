import type { StorageThreadType } from "@mastra/core/memory";
import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import {
  ThreadList,
  ThreadListEmpty,
  ThreadListItem,
  ThreadListItems,
  ThreadListNewItem,
  ThreadListSeparator,
} from "@mastra/playground-ui/components/ThreadList";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Plus } from "lucide-react";
import { useState } from "react";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { resolveConditional } from "../utils/conditional";

export interface ChatThreadsProps {
  threads: StorageThreadType[];
  threadId: string;
  onDelete: (threadId: string) => void;
  resourceId: string;
  resourceType: "agent" | "network";
  embedded?: boolean;
}

const formatDay = (date: Date) => {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "numeric",
    month: "short",
    second: "numeric",
  };
  return new Date(date).toLocaleString("zh-CN", options);
};

function isDefaultThreadName(name: string): boolean {
  const defaultPattern = /^New Thread \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  return defaultPattern.test(name);
}

function ThreadTitle({ title, id, createdAt }: { title?: string; id?: string; createdAt?: Date }) {
  const titleText = resolveConditional(
    title && !isDefaultThreadName(title),
    () => title,
    () => (createdAt ? formatDay(createdAt) : `会话 ${id ? id.slice(-5) : ""}`),
  );

  return <span className="block truncate">{titleText}</span>;
}

const DeleteThreadDialog = ({ open, onOpenChange, onDelete }: DeleteThreadDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>确认删除此会话吗？</AlertDialog.Title>
        <AlertDialog.Description>
          此操作无法撤销。该对话将从服务器中永久删除。
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>取消</AlertDialog.Cancel>
        <AlertDialog.Action onClick={onDelete}>继续</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog>
);

export const ChatThreads = ({
  threads,
  threadId,
  onDelete,
  resourceId,
  resourceType,
  embedded = false,
}: ChatThreadsProps) => {
  const { Link, paths } = useLinkComponent();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { canDelete } = usePermissions();

  const canDeleteThread = canDelete("memory");
  const newThreadLink =
    resourceType === "agent"
      ? paths.agentNewThreadLink(resourceId)
      : paths.networkNewThreadLink(resourceId);

  return (
    <>
      <ThreadList embedded={embedded}>
        <ThreadListNewItem as={Link} to={newThreadLink}>
          <Icon>
            <Plus />
          </Icon>
          新建对话
        </ThreadListNewItem>
        <ThreadListSeparator />

        {threads.length === 0 ? (
          <ThreadListEmpty>开始对话后，会话记录会显示在这里。</ThreadListEmpty>
        ) : (
          <ThreadListItems>
            {threads.map((thread) => {
              const isActive = thread.id === threadId;

              const threadLink =
                resourceType === "agent"
                  ? paths.agentThreadLink(resourceId, thread.id)
                  : paths.networkThreadLink(resourceId, thread.id);

              return (
                <ThreadListItem
                  key={thread.id}
                  as={Link}
                  to={threadLink}
                  isActive={isActive}
                  onDelete={canDeleteThread ? () => setDeleteId(thread.id) : undefined}
                  deleteLabel="删除会话"
                >
                  <ThreadTitle title={thread.title} id={thread.id} createdAt={thread.createdAt} />
                </ThreadListItem>
              );
            })}
          </ThreadListItems>
        )}
      </ThreadList>

      <DeleteThreadDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onDelete={() => {
          if (deleteId) {
            onDelete(deleteId);
          }
        }}
      />
    </>
  );
};

interface DeleteThreadDialogProps {
  open: boolean;
  onOpenChange: (n: boolean) => void;
  onDelete: () => void;
}
