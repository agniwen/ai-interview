import { toast } from "sonner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export async function openNotificationDocument(record: { id: string }) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    toast.error("请允许弹出窗口后重试");
    return;
  }
  popup.opener = null;
  try {
    const { documentUrl } = await rpcFetch(
      rpc.api.platform.notifications[":id"]["document-access"].$post({ param: { id: record.id } }),
      "获取飞书文档访问权失败",
    );
    popup.location.href = documentUrl;
  } catch (error) {
    popup.close();
    toast.error(error instanceof Error ? error.message : "打开飞书文档失败");
  }
}
