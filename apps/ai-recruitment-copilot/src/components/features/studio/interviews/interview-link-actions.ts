import { toast } from "sonner";

import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import type { StudioInterviewRoundListRecord } from "@arc/shared/studio-interview-rounds";

async function copyInterviewUrl(url: string, successMessage: string) {
  try {
    const result = await copyTextToClipboard(toAbsoluteUrl(url));
    if (result === "copied") {
      toast.success(successMessage);
      return;
    }
    if (result === "manual") {
      toast.info("已弹出链接，请手动复制");
      return;
    }
    throw new Error("copy-failed");
  } catch {
    toast.error("复制失败，请手动复制");
  }
}

export function copyInterviewLink(record: Pick<StudioInterviewRoundListRecord, "interviewLink">) {
  return copyInterviewUrl(record.interviewLink, "面试链接已复制");
}

export function copyPublicInterviewLink(record: StudioInterviewRoundListRecord) {
  return copyInterviewUrl(`/r/${record.id}`, "公共访问链接已复制");
}
