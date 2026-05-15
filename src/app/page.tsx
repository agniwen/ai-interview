import { redirect } from "next/navigation";
import { getCurrentSession, resolveActiveOrganization } from "@/lib/server/auth-session";
import HomeShell from "./_components/home-shell";

// 首页接受 ?goto=chat | studio 让登录用户直接落到对应入口；首页未登录用户的
// CTA 也会把 goto 透传到 sign-in callbackURL，登录完成后回到这里继续分流。
// 缺省（无 goto 或值非法）走 /w/[slug]/studio/resumes，保持向后兼容。
// `?goto=chat | studio` lets logged-in users land directly in the right entry.
// Unauthenticated CTAs forward the same query through the sign-in callback,
// so the routing intent survives the auth round-trip. Default (missing /
// unknown goto) is `/w/[slug]/studio/resumes` for backward compatibility.
type GotoTarget = "chat" | "studio";

function resolveGoto(value: string | string[] | undefined): GotoTarget | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "chat" || raw === "studio" ? raw : null;
}

function buildWorkspaceDestination(slug: string, goto: GotoTarget | null): string {
  if (goto === "chat") {
    return `/w/${slug}/chat`;
  }
  return `/w/${slug}/studio/resumes`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ goto?: string | string[] }>;
}) {
  const session = await getCurrentSession();
  if (session?.user) {
    const target = await resolveActiveOrganization();
    if (!target) {
      redirect("/select-workspace");
    }
    const { goto } = await searchParams;
    redirect(buildWorkspaceDestination(target.slug, resolveGoto(goto)));
  }

  return <HomeShell />;
}
