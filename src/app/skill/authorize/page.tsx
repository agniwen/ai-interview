import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { FeishuSignInButton } from "@/components/auth/feishu-sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { AuthorizeForm } from "./_components/authorize-form";

export const metadata: Metadata = {
  title: "授权 Skill 访问",
};

interface PageProps {
  searchParams: Promise<{ user_code?: string }>;
}

// =====================================================================
// /skill/authorize — Device Authorization Grant 用户审批页。
// 用户从终端 skill 登录命令拿到 user_code 之后，访问本页（带或不带 user_code 参数），
// 已登录则可一键确认 / 拒绝；未登录则提示先登录，登录后回到本页继续审批。
// =====================================================================

export default async function SkillAuthorizePage({ searchParams }: PageProps) {
  await connection();
  const params = await searchParams;
  const userCode = (params.user_code ?? "").toUpperCase();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const returnTo = `/skill/authorize${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ""}`;

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_38%),linear-gradient(180deg,rgba(10,14,24,1),rgba(2,6,16,0.98))]"
      id="main-content"
    >
      <div className="w-full max-w-md">
        <Card className="border-border/60 bg-background/92 shadow-lg">
          <CardHeader>
            <CardTitle>授权 Resume Parser Skill</CardTitle>
            <CardDescription>
              你正在授权一个 Claude Code skill
              调用本服务的简历解析接口。请确认下方授权码与终端显示的一致。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session?.user ? (
              <AuthorizeForm initialUserCode={userCode} userName={session.user.name} />
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  授权码：
                  <span className="ml-1 rounded bg-muted px-2 py-1 font-mono text-foreground">
                    {userCode || "（请在终端复制）"}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">请先登录，登录后会回到本页继续。</p>
                <FeishuSignInButton callbackURL={returnTo} />
                <FeishuSignInButton
                  callbackURL={returnTo}
                  label="极光 HR 飞书登录"
                  providerId="feishu-jiguang-hr"
                  variant="default"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-muted-foreground text-xs leading-normal">
          <Link className="font-medium text-primary hover:underline" href="/">
            返回首页
          </Link>
        </p>
      </div>
    </main>
  );
}
