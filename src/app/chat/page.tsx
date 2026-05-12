import { redirect } from "next/navigation";
import { getCurrentSession, resolveActiveOrganization } from "@/lib/server/auth-session";

// 兼容旧路径 /chat —— chat 现在挂在 /w/[slug]/chat 下。
// 这里解析当前用户活跃 workspace 后跳到对应 slug 的 chat 默认页(空会话)。
// Legacy /chat compat — chat now lives under /w/[slug]/chat. Resolve the user's
// active workspace and redirect to that slug's chat root (empty conversation).
export default async function LegacyChatPage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login?callbackURL=%2Fchat");
  }
  const active = await resolveActiveOrganization();
  if (!active) {
    redirect("/select-workspace");
  }
  redirect(`/w/${active.slug}/chat`);
}
