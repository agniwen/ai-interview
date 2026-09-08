import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  initialInterviewKeys,
  isInitialInterviewProcessing,
} from "@app/shared/human-initial-interview";
import type {
  HumanInitialInterviewDetail,
  InitialInterviewRoles,
  InitialInterviewTurn,
  InitialInterviewVersion,
} from "@app/shared/human-initial-interview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getInitialInterview,
  getInitialInterviewPlayback,
  getInitialInterviewResumeUrl,
} from "@/lib/client/initial-interviews";

const evaluationFields = [
  ["jobMotivation", "求职动机"],
  ["availability", "到岗时间"],
  ["overseasTravel", "海外出差"],
  ["compensationExpectations", "薪酬预期"],
  ["careerProgression", "加薪晋升"],
  ["recentWork", "最近两份工作"],
  ["projectHighlights", "亮点项目"],
] as const;

function speakerLabel(turn: InitialInterviewTurn, roles: InitialInterviewRoles) {
  if (roles[turn.speakerKey] === "candidate") {
    return "候选人";
  }
  if (roles[turn.speakerKey] === "interviewer") {
    return "HR";
  }
  return turn.speakerDisplayName ?? turn.speakerKey;
}

function RecruitingMaterials({
  detail,
  resumeUrl,
}: {
  detail: HumanInitialInterviewDetail;
  resumeUrl: string;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">生成时的岗位与简历资料</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm">
          {detail.snapshot.candidateName} · {detail.snapshot.job?.title ?? "未关联岗位"}
        </p>
        <p className="whitespace-pre-wrap text-muted-foreground text-sm">
          {detail.snapshot.job?.prompt ?? "无岗位 JD"}
        </p>
        <p className="whitespace-pre-wrap text-sm">{detail.snapshot.resumeText || "无简历文本"}</p>
        {detail.snapshot.resume ? (
          <a
            className="text-sm underline underline-offset-4"
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
          >
            查看简历附件快照
          </a>
        ) : null}
        {detail.snapshot.qualitativeResumeEvaluation ? (
          <div className="flex flex-col gap-2 text-sm">
            <h4 className="font-medium">当时的简历评估</h4>
            <p>{detail.snapshot.qualitativeResumeEvaluation.conciseOverall}</p>
            <p>{detail.snapshot.qualitativeResumeEvaluation.detailedOverall.judgment}</p>
            <p>{detail.snapshot.qualitativeResumeEvaluation.detailedOverall.matchingEvidence}</p>
            <p>{detail.snapshot.qualitativeResumeEvaluation.detailedOverall.risks}</p>
          </div>
        ) : null}
        {detail.snapshot.interviewQuestions.length ? (
          <div className="flex flex-col gap-2 text-sm">
            <h4 className="font-medium">当时的面试题</h4>
            <ol className="list-decimal pl-5">
              {detail.snapshot.interviewQuestions.map((question) => (
                <li key={question.order}>{question.question}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function VersionMaterials({
  detail,
  version,
  latest,
  canGenerate,
  pending,
  audioUrl,
  resumeUrl,
  onResume,
  onRegenerate,
}: {
  detail: HumanInitialInterviewDetail;
  version: InitialInterviewVersion;
  latest: boolean;
  canGenerate: boolean;
  pending: boolean;
  audioUrl?: string;
  resumeUrl: string;
  onResume: () => void;
  onRegenerate: (turns: InitialInterviewTurn[]) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [turns, setTurns] = useState(version.turns);
  const { roles } = version;
  const needsSpeakers = latest && version.status === "needs_speakers";
  return (
    <div className="flex flex-col gap-5">
      {audioUrl ? (
        // oxlint-disable-next-line jsx-a11y/media-has-caption -- The full timestamped transcript is displayed directly below the audio.
        <audio
          aria-label="人工初面录音副本"
          className="w-full"
          controls
          preload="none"
          ref={audioRef}
          src={audioUrl}
        />
      ) : null}
      {needsSpeakers && canGenerate ? (
        <Button disabled={pending} onClick={onResume}>
          重新生成
        </Button>
      ) : null}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">完整转写</h3>
          {canGenerate &&
          latest &&
          !isInitialInterviewProcessing(version.status) &&
          !needsSpeakers ? (
            <Button
              onClick={() => {
                setTurns(version.turns);
                setEditing((value) => !value);
              }}
              size="sm"
              variant="outline"
            >
              {editing ? "取消编辑" : "修正转写"}
            </Button>
          ) : null}
        </div>
        {turns.map((turn, index) => (
          <div className="flex flex-col gap-1.5" key={turn.id}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <button
                className="hover:text-foreground"
                type="button"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = turn.startMs / 1000;
                  }
                }}
              >
                {Math.floor(turn.startMs / 60_000)}:
                {String(Math.floor(turn.startMs / 1000) % 60).padStart(2, "0")}
              </button>
              <span>{speakerLabel(turn, roles)}</span>
            </div>
            {editing ? (
              <Textarea
                aria-label={`第 ${index + 1} 段转写`}
                value={turn.text}
                disabled={pending}
                onChange={(event) => {
                  const text = event.target.value;
                  setTurns((previous) =>
                    previous.map((item, position) =>
                      position === index ? { ...item, text } : item,
                    ),
                  );
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
            )}
          </div>
        ))}
        {editing ? (
          <Button
            disabled={pending || turns.some((turn) => !turn.text.trim())}
            onClick={() => onRegenerate(turns)}
          >
            使用修正版重新生成
          </Button>
        ) : null}
      </section>
      {version.evaluation ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">该版本生成结果</h3>
          <dl className="flex flex-col gap-3">
            {evaluationFields.map(([key, label]) => (
              <div key={key}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">
                  {version.evaluation?.[key] ?? "未收集到"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <RecruitingMaterials detail={detail} resumeUrl={resumeUrl} />
    </div>
  );
}

export function InitialInterviewMaterials({
  slug,
  recordId,
  snapshotId,
  canGenerate,
  pending,
  onClose,
  onResume,
  onRegenerate,
}: {
  slug: string;
  recordId: string;
  snapshotId: string;
  canGenerate: boolean;
  pending: boolean;
  onClose: () => void;
  onResume: (version: InitialInterviewVersion) => void;
  onRegenerate: (turns: InitialInterviewTurn[]) => void;
}) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const query = useQuery({
    queryFn: () => getInitialInterview(slug, recordId, snapshotId),
    queryKey: initialInterviewKeys.detail(slug, recordId, snapshotId),
  });
  const playback = useQuery({
    queryFn: () => getInitialInterviewPlayback(slug, recordId, snapshotId),
    queryKey: initialInterviewKeys.playback(slug, recordId, snapshotId),
    staleTime: 30 * 60_000,
  });
  const version =
    query.data?.versions.find((item) => item.id === selectedVersionId) ?? query.data?.versions[0];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>人工初面资料快照</DialogTitle>
          <DialogDescription>
            这些资料独立保存在招聘台，Echo 原录音的修改或删除不会影响它们。
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
          {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
          {query.error || playback.error ? (
            <p role="alert" className="text-destructive text-sm">
              {(query.error ?? playback.error)?.message}
            </p>
          ) : null}
          {query.data && version ? (
            <>
              <NativeSelect
                aria-label="评价历史版本"
                value={version.id}
                onChange={(event) => setSelectedVersionId(event.target.value)}
              >
                {query.data.versions.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    版本 {item.version} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <VersionMaterials
                key={version.id}
                detail={query.data}
                version={version}
                latest={version.id === query.data.versions[0]?.id}
                canGenerate={canGenerate}
                pending={pending}
                audioUrl={playback.data?.url}
                resumeUrl={getInitialInterviewResumeUrl(slug, recordId, snapshotId)}
                onResume={() => onResume(version)}
                onRegenerate={onRegenerate}
              />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
