import { IconVideo } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface CandidateInvitationProps {
  candidateName: string;
  title: string;
  scheduledAt: string | null;
  canRespond: boolean;
  pending: boolean;
  message?: string;
  onRespond: (response: "accept" | "decline") => Promise<void>;
}

const invitationDate = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function CandidateInvitation({
  candidateName,
  title,
  scheduledAt,
  canRespond,
  pending,
  message,
  onRespond,
}: CandidateInvitationProps) {
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const hasDate = date !== null && Number.isFinite(date.getTime());

  return (
    <main className="dark flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <section
        className="flex w-full max-w-lg flex-col items-center gap-6 text-center"
        aria-labelledby="candidate-invitation-title"
      >
        <div className="flex size-14 items-center justify-center rounded-full border border-muted/60 bg-muted/30">
          <IconVideo className="size-6 text-foreground" aria-hidden />
        </div>
        <div className="flex flex-col gap-2">
          <h1
            id="candidate-invitation-title"
            className="text-balance font-semibold text-2xl tracking-normal"
          >
            {title}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {canRespond ? `${candidateName}，请确认是否参加本次面试。` : message}
          </p>
          <dl className="text-sm text-muted-foreground">
            <dt className="sr-only">面试时间</dt>
            <dd>
              {hasDate ? (
                <time dateTime={scheduledAt ?? undefined}>
                  {invitationDate.format(date)}（北京时间）
                </time>
              ) : (
                "具体时间请联系招聘负责人确认"
              )}
            </dd>
          </dl>
        </div>
        {canRespond ? (
          <div className="flex flex-wrap items-center justify-center gap-3" aria-busy={pending}>
            <Button
              className="min-w-36"
              disabled={pending}
              onClick={() => onRespond("accept")}
              size="lg"
            >
              {pending ? "处理中…" : "确认参加"}
            </Button>
            <Button
              className="min-w-36"
              disabled={pending}
              onClick={() => onRespond("decline")}
              size="lg"
              variant="outline"
            >
              无法参加
            </Button>
          </div>
        ) : null}
        <p className="text-sm leading-6 text-muted-foreground">如需调整时间，请联系招聘负责人。</p>
      </section>
    </main>
  );
}
