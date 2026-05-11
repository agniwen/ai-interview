import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SignInTabs } from "@/components/auth/sign-in-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/server/auth";
import { LoginErrorToast } from "./_components/login-error-toast";

interface PageProps {
  searchParams: Promise<{
    /** better-auth OAuth 失败时回跳带的 error 码，例如 `banned`、`access_denied`。 */
    error?: string;
    error_description?: string;
  }>;
}

export const metadata: Metadata = {
  title: "登录",
};

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
// /login — 统一的登录入口：
//   1. 未登录 → 渲染 SignInTabs
//   2. 已登录 → redirect 到 /（根路由解析活跃 workspace）
// =====================================================================

export default async function LoginPage({ searchParams }: PageProps) {
  await connection();
  const params = await searchParams;
  const errorCode = params.error;
  const errorDescription = params.error_description;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

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

  // 已登录 —— 跳转首页，由根路由解析活跃 workspace。
  // Already logged in — go home and let the root route resolve the active workspace.
  redirect("/");
}
