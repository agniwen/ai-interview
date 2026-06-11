import type { ReactNode } from "react";
import { Link, createFileRoute, useSearch } from "@tanstack/react-router";

import { SignInTabs } from "@/components/features/auth/sign-in-tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginErrorToast } from "@/components/features/login/login-error-toast";

interface LoginSearch {
  callbackURL?: string;
  error?: string;
  error_description?: string;
  returnTo?: string;
}

function readSearchValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sanitizeCallbackURL(raw: string | undefined): string {
  if (!raw?.startsWith("/")) {
    return "/";
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

function AuthShell({
  title,
  description,
  children,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_38%),linear-gradient(180deg,rgba(10,14,24,1),rgba(2,6,16,0.98))]"
      id="main-content"
    >
      <div className="w-full max-w-md">
        <Card className="border-border bg-background/92 shadow-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>

        <p className="mt-4 text-center text-muted-foreground text-xs leading-normal">
          <Link className="font-medium text-primary hover:underline" to="/">
            返回首页
          </Link>
        </p>
      </div>
    </main>
  );
}

function LoginRoute() {
  const search = useSearch({ from: "/login" });
  const callbackURL = sanitizeCallbackURL(search.callbackURL ?? search.returnTo);

  return (
    <AuthShell description="使用飞书账号登录，或用管理员分配的账号密码登录。" title="登录">
      <SignInTabs callbackURL={callbackURL} />
      {search.error ? (
        <LoginErrorToast errorCode={search.error} errorDescription={search.error_description} />
      ) : null}
    </AuthShell>
  );
}

export const Route = createFileRoute("/login")({
  component: LoginRoute,
  head: () => ({
    meta: [{ title: "登录" }],
  }),
  validateSearch: (search): LoginSearch => ({
    callbackURL: readSearchValue(search.callbackURL),
    error: readSearchValue(search.error),
    error_description: readSearchValue(search.error_description),
    returnTo: readSearchValue(search.returnTo),
  }),
});
