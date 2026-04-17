import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FeishuSignInButton } from "@/components/auth/feishu-sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/auth-roles";

export const metadata: Metadata = {
  title: "登录",
};

export default async function LoginPage() {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return (
      <main
        className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10"
        id="main-content"
      >
        <div className="w-full max-w-md">
          <Card className="border-border/60 bg-background/92 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle>登录</CardTitle>
              <CardDescription>使用飞书账号登录，登录后即可使用完整功能。</CardDescription>
            </CardHeader>
            <CardContent>
              <FeishuSignInButton callbackURL="/login" />
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-muted-foreground text-xs leading-relaxed">
            <Link className="font-medium text-primary hover:underline" href="/">
              返回首页
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (canAccessAdmin(session.user)) {
    redirect("/studio");
  }

  redirect("/studio-unauthorized");
}
