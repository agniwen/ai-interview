import { authClient } from "@/lib/auth-client";
import { listWorkspaces } from "./workspace";
import type { EchoProcessingOwner } from "../../../../preload/echo-processing-api";

export function hasEchoProcessing(): boolean {
  return "window" in globalThis && Boolean(window.api?.echoProcessing);
}

export async function echoProcessingOwner(slug: string): Promise<EchoProcessingOwner> {
  if (!hasEchoProcessing()) {
    throw new Error("请在 Echo 中处理此录音");
  }
  const [session, workspaces] = await Promise.all([authClient.getSession(), listWorkspaces()]);
  const workspace = workspaces.find((item) => item.slug === slug);
  if (!workspace || !session.data?.user.id) {
    throw new Error("请登录并打开录音所属工作区");
  }
  return {
    accountId: session.data.user.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  };
}

export async function retryEchoProcessing(
  slug: string,
  meetingId: string,
): Promise<{ state: "processing" }> {
  const owner = await echoProcessingOwner(slug);
  const status = await window.api.echoProcessing.status(meetingId, owner.accountId);
  if (status.state === "unbound") {
    throw new Error("请先选择在此设备继续处理");
  }
  await window.api.echoProcessing.retry(meetingId);
  return { state: "processing" };
}
