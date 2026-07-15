import { Button } from "@mastra/playground-ui/components/Button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useDisconnectChannel } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-channels";
import type { ChannelPlatformInfo } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-channels";

export interface DisconnectChannelContentProps {
  platform: ChannelPlatformInfo;
  agentId: string;
  onCancel: () => void;
  onClose: () => void;
}

export function DisconnectChannelContent({
  platform,
  agentId,
  onCancel,
  onClose,
}: DisconnectChannelContentProps) {
  const { mutateAsync: disconnect, isPending } = useDisconnectChannel(platform.id);

  const handleConfirm = async () => {
    try {
      await disconnect(agentId);
      toast.success(`已断开 ${platform.name}`);
      onClose();
    } catch (error) {
      const e = error as Error & { body?: { error?: string } };
      toast.error(e.body?.error || e.message || "断开渠道失败");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>确定要继续吗？</DialogTitle>
        <DialogDescription>
          你的智能体将从 <span className="text-neutral6">{platform.name}</span> 中移除。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          取消
        </Button>
        <Button
          variant="default"
          onClick={handleConfirm}
          disabled={isPending}
          data-testid={`publish-channel-dialog-${platform.id}-disconnect-confirm`}
        >
          {isPending ? "正在断开…" : "确认"}
        </Button>
      </DialogFooter>
    </>
  );
}
