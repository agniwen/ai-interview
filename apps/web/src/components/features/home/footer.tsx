// 用途：极简页脚
// Purpose: Minimal footer.
import { Link } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import * as m from "@/paraglide/messages";

const COPYRIGHT_YEAR = 2026;

export function HomeFooter() {
  return (
    <footer className="mx-auto w-full max-w-360 px-6 pb-10 sm:px-8 lg:px-12">
      <Separator className="mb-10 bg-border/60" />
      <div className="flex flex-wrap items-end justify-between gap-8 pb-12 lg:pb-20">
        <p className="max-w-[10em] text-pretty font-medium text-[clamp(2rem,5.5vw,5rem)] text-foreground leading-[1.15] tracking-[-0.05em]">
          AI Hiring Copilot
        </p>
      </div>
      <div className="flex flex-col items-start justify-between gap-4 text-muted-foreground text-xs sm:flex-row sm:items-center sm:text-sm">
        <p>© {COPYRIGHT_YEAR} AI Hiring Copilot</p>
        <nav className="flex items-center gap-5">
          <Link className="transition-colors hover:text-foreground" to="/">
            {m.home_footer_product()}
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/login">
            {m.home_footer_login()}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
