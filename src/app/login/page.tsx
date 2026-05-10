import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { FeishuSignInButton } from "@/components/auth/feishu-sign-in-button";
import { SignInTabs } from "@/components/auth/sign-in-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/server/auth";
import { canAccessAdmin } from "@/lib/server/auth-roles";
import { LoginErrorToast } from "./_components/login-error-toast";
import { SkillAuthorizeForm } from "./_components/skill-authorize-form";
import { UnauthorizedNotice } from "./_components/unauthorized-notice";

interface PageProps {
  searchParams: Promise<{
    action?: string;
    user_code?: string;
    /** better-auth OAuth 失败时回跳带的 error 码，例如 `banned`、`access_denied`。 */
    error?: string;
    error_description?: string;
  }>;
}

const SKILL_ACTION = "approve-skill" as const;

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: params.action === SKILL_ACTION ? "授权 Skill 访问" : "登录",
  };
}

// =====================================================================
// 卡片外壳：统一所有分支的视觉容器。
// Shared card shell so all branches share the gradient background + card
// layout without duplicated className strings.
// =====================================================================

function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_38%),linear-gradient(180deg,rgba(10,14,24,1),rgba(2,6,16,0.98))]"
      id="main-content"
    >
      <div className="w-full max-w-md">
        <Card className="border-border/60 bg-background/92 shadow-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
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

// =====================================================================
// /login — 统一的登录入口，承担三种状态：
//   1. 未登录 → 渲染 SignInTabs
//   2. 已登录 admin → redirect 到 /studio
//   3. 已登录但非 admin → 渲染 UnauthorizedNotice（退出账号后回首页）
//
// 另外通过 ?action=approve-skill[&user_code=...] 承担 Device Authorization
// Grant 的用户审批流（合并自原 /skill/authorize）。
// =====================================================================

export default async function LoginPage({ searchParams }: PageProps) {
  await connection();
  const params = await searchParams;
  const isSkillApprove = params.action === SKILL_ACTION;
  const userCode = (params.user_code ?? "").toUpperCase();
  const errorCode = params.error;
  const errorDescription = params.error_description;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // ---------------------------------------------------------------------
  // Branch A: skill device-grant 审批 —— 与登录入口共用 UI 框架与登录回跳。
  // ---------------------------------------------------------------------
  if (isSkillApprove) {
    const callbackPath = `/login?action=${SKILL_ACTION}${
      userCode ? `&user_code=${encodeURIComponent(userCode)}` : ""
    }`;

    return (
      <AuthShell
        description="你正在授权一个 Claude Code skill 调用本服务的简历解析接口。请确认下方授权码与终端显示的一致。"
        title="授权 Resume Parser Skill"
      >
        {session?.user ? (
          <SkillAuthorizeForm initialUserCode={userCode} userName={session.user.name} />
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              授权码：
              <span className="ml-1 rounded bg-muted px-2 py-1 font-mono text-foreground">
                {userCode || "（请在终端复制）"}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">请先登录，登录后会回到本页继续。</p>
            <FeishuSignInButton callbackURL={callbackPath} />
            <FeishuSignInButton
              callbackURL={callbackPath}
              label="极光 HR 飞书登录"
              providerId="feishu-jiguang-hr"
              variant="default"
            />
          </div>
        )}
      </AuthShell>
    );
  }

  // ---------------------------------------------------------------------
  // Branch B: 普通登录入口。
  // ---------------------------------------------------------------------
  if (!session?.user) {
    return (
      <AuthShell description="使用飞书账号登录，或用管理员分配的账号密码登录。" title="登录">
        <SignInTabs callbackURL="/login" />
        {errorCode ? (
          <LoginErrorToast errorCode={errorCode} errorDescription={errorDescription} />
        ) : null}
      </AuthShell>
    );
  }

  if (canAccessAdmin(session.user)) {
    redirect("/studio");
  }

  // 已登录但非 admin —— 提示后强制 sign-out 再回首页（避免无限重定向）。
  return <UnauthorizedNotice />;
}
