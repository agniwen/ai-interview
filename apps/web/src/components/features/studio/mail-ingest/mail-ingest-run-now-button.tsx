import { pollWorkspaceMailIngestNow } from "@/lib/client/backend-api";
import { IconRefresh } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/client/api";

export function MailIngestRunNowButton({ canManage, slug }: { canManage: boolean; slug: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(
        pollWorkspaceMailIngestNow({ path: { workspaceSlug: slug } }),

        "立即轮询触发失败",
      ),
    onError: (error) => toast.error(error instanceof Error ? error.message : "立即轮询触发失败"),
    onSuccess: () => {
      toast.success("已开始立即轮询，下次轮训将在 15 分钟后进行");
      void queryClient.invalidateQueries({ queryKey: ["managed-mail-ingest-accounts", slug] });
    },
  });

  if (!canManage) {
    return null;
  }

  return (
    <Button disabled={mutation.isPending} onClick={() => mutation.mutate()} type="button">
      <IconRefresh className={mutation.isPending ? "animate-spin" : undefined} />
      {mutation.isPending ? "触发中…" : "立即轮询"}
    </Button>
  );
}
