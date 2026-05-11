import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "平台管理",
};

export default function PlatformIndex() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">平台管理</h1>
      <p className="text-muted-foreground">
        仅平台 super-admin (user.role = &quot;admin&quot;) 可见。用于跨工作区运维。
      </p>
      <nav className="space-y-2">
        <Link
          className="block rounded-lg border p-4 transition-colors hover:bg-accent"
          href="/platform/organizations"
        >
          <div className="font-semibold">所有工作区</div>
          <div className="text-sm text-muted-foreground">查看平台上所有 organization</div>
        </Link>
        <Link
          className="block rounded-lg border p-4 transition-colors hover:bg-accent"
          href="/platform/users"
        >
          <div className="font-semibold">所有用户</div>
          <div className="text-sm text-muted-foreground">查看所有用户、封禁、改角色</div>
        </Link>
      </nav>
    </div>
  );
}
