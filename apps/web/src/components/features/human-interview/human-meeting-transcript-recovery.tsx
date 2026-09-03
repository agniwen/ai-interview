import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { FinalMeetingTranscriptRevision } from "@app/shared/meeting-transcription";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const audioSchema = z.object({ endSeconds: z.number(), startSeconds: z.number(), url: z.url() });

export function HumanMeetingTranscriptRecovery({
  transcript,
  basePath,
  disabled,
  onUpdated,
}: {
  transcript: FinalMeetingTranscriptRevision;
  basePath: string;
  disabled: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(50);
  const [roles, setRoles] = useState<Record<string, "candidate" | "interviewer">>({});
  const [busy, setBusy] = useState(false);
  const [playback, setPlayback] = useState<
    (z.infer<typeof audioSchema> & { turnId: string }) | null
  >(null);
  const pending = transcript.turns.filter((turn) => turn.attribution?.role === "unknown");
  if (pending.length === 0) {
    return null;
  }
  return (
    <Alert className="mt-4">
      <AlertTitle>有 {pending.length} 段发言待确认身份</AlertTitle>
      <AlertDescription>
        <p>
          这些片段来自补救录音，暂不作为候选人能力证据。可回听后确认身份；不影响手动保存或提交评价。
        </p>
        <Button
          variant="outline"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起待确认片段" : "查看待确认片段"}
        </Button>
        {expanded ? (
          <div className="w-full space-y-4">
            {pending.slice(0, limit).map((turn) => (
              <section
                className="space-y-2 border-b pb-3"
                key={turn.id}
                aria-label={`待确认片段 ${turn.sequence + 1}`}
              >
                <p className="text-muted-foreground text-xs">
                  {(turn.startMs / 1000).toFixed(1)}s — {(turn.endMs / 1000).toFixed(1)}s · 待确认
                </p>
                <p id={`recovery-text-${turn.id}`} className="whitespace-pre-wrap text-foreground">
                  {turn.text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleGroup
                    variant="outline"
                    aria-label={`片段 ${turn.sequence + 1} 的发言人`}
                    value={roles[turn.id] ? [roles[turn.id]] : []}
                    disabled={disabled || busy}
                    onValueChange={([role]) => {
                      setRoles((current) => {
                        const next = { ...current };
                        if (role === "candidate" || role === "interviewer") {
                          next[turn.id] = role;
                        } else {
                          return Object.fromEntries(
                            Object.entries(current).filter(([id]) => id !== turn.id),
                          );
                        }
                        return next;
                      });
                    }}
                  >
                    <ToggleGroupItem value="candidate">候选人</ToggleGroupItem>
                    <ToggleGroupItem value="interviewer">面试官</ToggleGroupItem>
                  </ToggleGroup>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const response = await fetch(
                          `${basePath}/transcript-audio/${encodeURIComponent(turn.id)}`,
                        );
                        if (!response.ok) {
                          throw new Error("无法加载此片段的录音，请刷新后重试。");
                        }
                        setPlayback({
                          ...audioSchema.parse(await response.json()),
                          turnId: turn.id,
                        });
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "回听失败");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    回听
                  </Button>
                </div>
                {playback?.turnId === turn.id ? (
                  // oxlint-disable-next-line jsx-a11y/media-has-caption -- The adjacent, aria-describedby transcript is the text alternative for this audio-only excerpt.
                  <audio
                    key={playback.url}
                    controls
                    preload="metadata"
                    aria-label="片段录音"
                    aria-describedby={`recovery-text-${turn.id}`}
                    src={playback.url}
                    onLoadedMetadata={(event) => {
                      event.currentTarget.currentTime = playback.startSeconds;
                    }}
                    onTimeUpdate={(event) => {
                      if (event.currentTarget.currentTime >= playback.endSeconds) {
                        event.currentTarget.pause();
                      }
                    }}
                  />
                ) : null}
              </section>
            ))}
            {pending.length > limit ? (
              <Button type="button" variant="outline" onClick={() => setLimit(limit + 50)}>
                显示更多片段
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={disabled || busy || Object.keys(roles).length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await fetch(`${basePath}/transcript-attribution`, {
                    body: JSON.stringify({
                      assignments: Object.entries(roles)
                        .slice(0, 200)
                        .map(([turnId, role]) => ({ role, turnId })),
                      sourceRevisionId: transcript.id,
                    }),
                    headers: { "content-type": "application/json" },
                    method: "POST",
                  });
                  if (!response.ok) {
                    throw new Error("确认失败，转录可能已更新，请刷新后重试。");
                  }
                  await onUpdated();
                  toast.success("已保存身份确认；现有评价保持不变，需要时可点击重新生成。");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "确认失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认所选身份
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
