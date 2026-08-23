// 用途：极简页脚
// Purpose: Minimal footer.
import { Link } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";

const COPYRIGHT_YEAR = 2026;

export function HomeFooter() {
  return (
    <footer className="mx-auto w-full max-w-360 px-5 pb-12 sm:px-8">
      <Separator className="mb-12 bg-border/60" />
      <div className="flex flex-col items-center justify-between gap-4 text-foreground/70 text-xs sm:flex-row sm:text-sm">
        <p>© {COPYRIGHT_YEAR} AI Recruitment Copilot</p>
        <nav className="flex items-center gap-5">
          <Link className="transition-colors hover:text-foreground" to="/">
            产品
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/login">
            登录
          </Link>
        </nav>
      </div>
    </footer>
  );
}
