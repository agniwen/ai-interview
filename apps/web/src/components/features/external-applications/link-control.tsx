import { IconCopy, IconTable } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { rpc } from "@/lib/client/rpc";

export function ExternalApplicationLinkControl({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const endpoint = rpc.api.w[":slug"].studio["external-application-link"];
  const queryKey = ["external-application-link", slug];
  const [feishuModalOpen, setFeishuModalOpen] = useState(false);
  const [bitableUrlDraft, setBitableUrlDraft] = useState("");
  const [bitableUrlError, setBitableUrlError] = useState<string | null>(null);

  const link = useQuery({
    queryFn: () => rpcFetch(endpoint.$get({ param: { slug } }), "无法加载投递链接"),
    queryKey,
  });

  const update = useMutation({
    mutationFn: (payload: { enabled: boolean; feishuBitableUrl?: string | null }) =>
      rpcFetch(endpoint.$put({ json: payload, param: { slug } }), "无法更新投递链接"),
    onError: (error) => {
      if (feishuModalOpen) {
        setBitableUrlError(error.message);
        return;
      }
      toast.error(error.message);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKey, settings);
      if (feishuModalOpen) {
        setFeishuModalOpen(false);
        setBitableUrlError(null);
        toast.success(
          settings.feishuBitableUrl ? "已保存飞书多维表格同步地址" : "已清除飞书同步配置",
        );
      }
    },
  });

  const settings = link.data;
  const token = settings?.token;

  function openFeishuModal() {
    setBitableUrlDraft(settings?.feishuBitableUrl ?? "");
    setBitableUrlError(null);
    setFeishuModalOpen(true);
  }

  function handleSaveFeishuUrl(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) {
      return;
    }
    setBitableUrlError(null);
    const trimmed = bitableUrlDraft.trim();
    update.mutate({
      enabled: settings.enabled,
      feishuBitableUrl: trimmed || null,
    });
  }

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
        <>
          <Button variant="outline" disabled={update.isPending} onClick={openFeishuModal}>
            <IconTable data-icon="inline-start" />
            {settings.feishuBitableUrl ? "已配飞书" : "飞书同步"}
          </Button>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ enabled: !settings.enabled })}
          >
            {settings.enabled ? "停用链接" : "启用链接"}
          </Button>
        </>
      ) : null}
      {link.isError ? (
        <span role="alert" className="text-sm text-destructive">
          无法加载投递链接。
        </span>
      ) : null}

      <Modal
        open={feishuModalOpen}
        onOpenChange={setFeishuModalOpen}
        title="配置飞书多维表格同步"
        description="外部投递收到简历与作品附件后，将自动同步创建并更新对应多维表格记录。"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {settings?.feishuBitableUrl ? (
              <Button
                disabled={update.isPending}
                type="button"
                variant="ghost"
                onClick={() =>
                  update.mutate({
                    enabled: settings.enabled,
                    feishuBitableUrl: null,
                  })
                }
              >
                清除配置
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                disabled={update.isPending}
                type="button"
                variant="outline"
                onClick={() => setFeishuModalOpen(false)}
              >
                取消
              </Button>
              <Button disabled={update.isPending} form="external-link-feishu-form" type="submit">
                {update.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        }
      >
        <form className="space-y-4" id="external-link-feishu-form" onSubmit={handleSaveFeishuUrl}>
          <Field data-invalid={bitableUrlError ? "true" : undefined}>
            <FieldLabel htmlFor="external-link-feishu-url">飞书多维表格链接</FieldLabel>
            <Input
              aria-invalid={bitableUrlError ? true : undefined}
              disabled={update.isPending}
              id="external-link-feishu-url"
              placeholder="https://.../wiki/...?...table=tbl..."
              type="url"
              value={bitableUrlDraft}
              onChange={(event) => {
                setBitableUrlDraft(event.target.value);
                if (bitableUrlError) {
                  setBitableUrlError(null);
                }
              }}
            />
            <FieldDescription>
              粘贴包含 `table=` 参数的多维表格或知识库多维表格链接，并确保极光矩阵应用已获编辑权限。
            </FieldDescription>
            {bitableUrlError ? <FieldError>{bitableUrlError}</FieldError> : null}
          </Field>
        </form>
      </Modal>
    </>
  );
}
