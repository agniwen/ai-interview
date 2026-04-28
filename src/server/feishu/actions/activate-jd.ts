// 中文：activate-jd 卡片按钮的处理器；要求 OAuth 已绑定，按 thread 写入激活 JD
// English: handler for activate-jd card button; requires OAuth binding, writes active JD per thread
import type { ActionEvent } from "chat";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobDescription } from "@/lib/db/schema";
import { JdStatusCard } from "../cards/jd-status-card";
import { OAuthBindingCard } from "../cards/oauth-binding-card";
import { requireBinding } from "../identity/require-binding";
import { setActiveJd } from "../session/active-jd";

function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";
}

export async function handleActivateJd(event: ActionEvent): Promise<void> {
  const { thread } = event;
  if (!thread) {
    return;
  }

  const binding = await requireBinding(event.user.userId ?? "");
  if ("unbound" in binding) {
    await thread.post(OAuthBindingCard({ appUrl: getAppUrl() }) as never);
    return;
  }

  const jdId = event.value ?? "";
  if (!jdId) {
    await thread.post(
      JdStatusCard({
        jdLabel: "（该 JD 已失效，请重新选择）",
        kind: "activated",
      }) as never,
    );
    return;
  }

  const [jd] = await db
    .select({ id: jobDescription.id, name: jobDescription.name })
    .from(jobDescription)
    .where(eq(jobDescription.id, jdId))
    .limit(1);

  if (!jd) {
    // 中文：JD 已被删除或 id 错误；提示用户而不是静默成功
    // English: JD missing — surface a hint instead of silently succeeding
    await thread.post(
      JdStatusCard({
        jdLabel: "（该 JD 已失效，请重新选择）",
        kind: "activated",
      }) as never,
    );
    return;
  }

  await setActiveJd(thread.id, jd.id);
  await thread.post(JdStatusCard({ jdLabel: jd.name, kind: "activated" }) as never);
}
