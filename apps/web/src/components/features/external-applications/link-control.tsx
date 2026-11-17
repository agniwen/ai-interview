import { IconCopy } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { rpc } from "@/lib/client/rpc";

export function ExternalApplicationLinkControl({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const endpoint = rpc.api.w[":slug"].studio["external-application-link"];
  const queryKey = ["external-application-link", slug];
  const link = useQuery({
    queryFn: () => rpcFetch(endpoint.$get({ param: { slug } }), "无法加载投递链接"),
    queryKey,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      rpcFetch(endpoint.$put({ json: { enabled }, param: { slug } }), "无法更新投递链接"),
    onError: (error) => toast.error(error.message),
    onSuccess: (settings) => queryClient.setQueryData(queryKey, settings),
  });
  const settings = link.data;
  const token = settings?.token;
  return (
    <>
      <Button
        variant="outline"
        disabled={!token || update.isPending}
        onClick={async () => {
          if (!token) {
            return;
          }
          try {
            await navigator.clipboard.writeText(
              new URL(`/apply/${token}`, window.location.origin).href,
            );
            toast.success("已复制投递链接");
          } catch {
            toast.error("复制失败，请重试");
          }
        }}
      >
        <IconCopy data-icon="inline-start" />
        复制链接
      </Button>
      {settings?.canManage ? (
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() => update.mutate(!settings.enabled)}
        >
          {settings.enabled ? "停用链接" : "启用链接"}
        </Button>
      ) : null}
      {link.isError ? (
        <span role="alert" className="text-sm text-destructive">
          无法加载投递链接。
        </span>
      ) : null}
    </>
  );
}
