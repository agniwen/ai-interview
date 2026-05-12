import { redirect } from "next/navigation";
import { getCurrentSession, resolveActiveOrganization } from "@/lib/server/auth-session";

// 兼容旧路径 /studio/interviews —— studio 现在挂在 /w/[slug]/studio 下。
// 解析当前用户活跃 workspace 后跳到对应 slug 的 studio/interviews。
// Legacy /studio/interviews compat — studio now lives under /w/[slug]/studio.
// Resolve the user's active workspace and redirect to that slug's interviews list.
export default async function LegacyStudioInterviewsPage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login?callbackURL=%2Fstudio%2Finterviews");
  }
  const active = await resolveActiveOrganization();
  if (!active) {
    redirect("/select-workspace");
  }
  redirect(`/w/${active.slug}/studio/interviews`);
}
