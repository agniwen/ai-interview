// 用途：极简页脚
// Purpose: Minimal footer.
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function HomeFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
      <Separator className="mb-8 bg-border/60" />
      <div className="flex flex-col items-center justify-between gap-4 text-foreground/70 text-xs sm:flex-row sm:text-sm">
        <p>© {new Date().getFullYear()} 招聘协作工作台</p>
        <nav className="flex items-center gap-5">
          <Link className="transition-colors hover:text-foreground" href="/chat">
            产品
          </Link>
          <Link className="transition-colors hover:text-foreground" href="/login">
            登录
          </Link>
        </nav>
      </div>
    </footer>
  );
}
