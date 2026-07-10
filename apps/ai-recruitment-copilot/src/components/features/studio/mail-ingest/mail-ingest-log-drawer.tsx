import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface MailIngestLogAccount {
  emailAddress: string;
  id: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}

export function renderRunSummary(account: {
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}): { error: string | null; label: string; showCounts: boolean } {
  if (account.lastCheckedAt === null) {
    return { error: null, label: "尚未轮询", showCounts: false };
  }
  const allZero =
    !account.lastRunReceived &&
    !account.lastRunSubjectSkipped &&
    !account.lastRunMatched &&
    !account.lastRunQueued &&
    !account.lastRunFailed;
  if (account.lastError && allZero) {
    return {
      error: account.lastError,
      label: "最近轮询失败，暂无成功快照",
      showCounts: false,
    };
  }
  return { error: account.lastError, label: "上轮快照", showCounts: true };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  const min = Math.round(diffMs / 60_000);
  if (Math.abs(min) < 60) {
    return rtf.format(-min, "minute");
  }
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) {
    return rtf.format(-hr, "hour");
  }
  return rtf.format(-Math.round(hr / 24), "day");
}

export function MailIngestLogDrawer({
  account,
  onOpenChange,
  open,
  slug: _slug,
}: {
  account: MailIngestLogAccount | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}) {
  const summary = account ? renderRunSummary(account) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
          <SheetTitle>入库记录</SheetTitle>
          <SheetDescription>{account?.emailAddress ?? null}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-6">
          {account && summary ? (
            <section className="space-y-1">
              <p className="font-medium text-sm">{summary.label}</p>
              {summary.showCounts ? (
                <p className="text-muted-foreground text-sm">
                  {`收到${account.lastRunReceived ?? 0} · 标题不符${account.lastRunSubjectSkipped ?? 0} · 命中${account.lastRunMatched ?? 0} · 入队${account.lastRunQueued ?? 0} · 失败${account.lastRunFailed ?? 0}`}
                </p>
              ) : null}
              {account.lastCheckedAt ? (
                <p className="text-muted-foreground text-xs">
                  {`最近检查：${formatRelative(account.lastCheckedAt)}`}
                </p>
              ) : null}
              {summary.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {summary.error}
                </p>
              ) : null}
            </section>
          ) : null}
          {/* MailIngestLogMessages 表在 Task 6 加入此处 */}
        </div>
      </SheetContent>
    </Sheet>
  );
}
