import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage({ compact = false }: { compact?: boolean }) {
  return (
    <main
      className={
        compact
          ? "flex min-h-[56dvh] items-center justify-center px-4 py-10 text-foreground"
          : "flex min-h-dvh items-center justify-center bg-background px-6 py-16 text-foreground"
      }
      id="main-content"
    >
      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <h1 className="text-balance text-3xl tracking-normal sm:text-4xl">页面不存在</h1>
        <p className="mt-4 max-w-md text-muted-foreground text-sm leading-6">
          链接可能已经失效，或者你当前没有对应资源的访问权限。
        </p>
        <div className="mt-8">
          <Button nativeButton={false} render={<Link to="/">回到首页</Link>} variant="outline" />
        </div>
      </div>
    </main>
  );
}
