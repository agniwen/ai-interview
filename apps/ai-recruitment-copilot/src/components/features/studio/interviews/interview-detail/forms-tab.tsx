import { IconArrowBackUp } from "@tabler/icons-react";
import type { CandidateFormSubmissionWithSnapshot } from "@arc/db-schema/candidate-forms";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FormQuestion = CandidateFormSubmissionWithSnapshot["snapshot"]["questions"][number];

/**
 * 候选人答案的纯展示渲染：跟 form-template-submissions-drawer 共用一套设计语言。
 *   - 选项题（single / multi）→ Badge chips
 *   - 自由文本 → 淡背景圆角文本块（避免在表单卡内再出现卡片）
 *   - 未作答 → 比 muted 更弱的灰，不斜体
 * 注意外层卡片在 forms-tab 里是 bg-muted/30，所以这里的文本答案只保留轻量
 * 背景对比，不再加边框。
 *
 * View-only answer rendering shared with the submissions drawer. The forms
 * tab's outer card is bg-muted/30, so the text answer keeps only a subtle
 * rounded background contrast instead of another bordered card.
 */
function renderAnswer(question: FormQuestion, rawValue: string | string[] | undefined) {
  if (
    rawValue === undefined ||
    rawValue === "" ||
    (Array.isArray(rawValue) && rawValue.length === 0)
  ) {
    return <span className="text-muted-foreground/70 text-sm">候选人未作答</span>;
  }
  if (question.type === "single" || question.type === "multi") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const labels = values.map((v) => question.options.find((opt) => opt.value === v)?.label ?? v);
    return (
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label, index) => (
          <Badge
            // biome-ignore lint/suspicious/noArrayIndexKey: historical order is stable
            className="font-normal"
            key={index}
            variant="secondary"
          >
            {label}
          </Badge>
        ))}
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap rounded-xl bg-muted/50 px-3 py-2 text-foreground text-sm leading-relaxed">
      {Array.isArray(rawValue) ? rawValue.join(", ") : rawValue}
    </div>
  );
}

/**
 * 「表单题」Tab 的内容：列出候选人提交过的所有表单快照与回答。
 * Forms tab body — lists every form snapshot the candidate submitted, with answers.
 */
export function FormsTab({
  submissions,
  resettingId,
  onReset,
}: {
  submissions: CandidateFormSubmissionWithSnapshot[];
  resettingId: string | null;
  /**
   * 重置回调。传 undefined 时隐藏「重置填写」按钮（公开访问入口下没有写权限）。
   * When undefined, the per-row reset button is hidden (used by public access).
   */
  onReset?: (submissionId: string) => void;
}) {
  if (submissions.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        候选人没有填写过任何表单题。
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {submissions.map((submission) => (
        <article className="space-y-4 border-t border-border/50 pt-5" key={submission.id}>
          {/* 头部：表单标题 + 描述为主信息；版本徽章 + 重置按钮在右侧操作区。
              用 border-b 分隔头部和问答内容，跟 drawer 的卡片结构对齐。
              Header: title + description as primary info; version + reset as
              the right-side action area. The border-b mirrors the drawer
              card structure so both surfaces feel consistent. */}
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-base text-foreground leading-tight">
                {submission.snapshot.title}
              </h3>
              {submission.snapshot.description ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {submission.snapshot.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge className="font-mono text-[10px] tracking-wider" variant="outline">
                v{submission.version}
              </Badge>
              {onReset ? (
                <Button
                  disabled={resettingId === submission.id}
                  onClick={() => onReset(submission.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconArrowBackUp className="size-3.5" />
                  {resettingId === submission.id ? "重置中..." : "重置填写"}
                </Button>
              ) : null}
            </div>
          </header>

          {/* 问答区：编号 + 问题为 muted label，答案为前景内容；跟 drawer 完全一致。
              Numbered question = muted label; answer = foreground content. Same
              Field-style hierarchy as the drawer card. */}
          <div className="space-y-3.5">
            {submission.snapshot.questions.map((question, index) => (
              <div className="space-y-1.5" key={question.id}>
                <p className="flex items-baseline gap-1 text-muted-foreground text-xs">
                  <span className="font-mono">{index + 1}.</span>
                  <span>{question.label}</span>
                  {question.required ? (
                    <span aria-label="必填" className="text-destructive">
                      *
                    </span>
                  ) : null}
                </p>
                {question.helperText ? (
                  <p className="text-muted-foreground/80 text-xs leading-relaxed">
                    {question.helperText}
                  </p>
                ) : null}
                <div>{renderAnswer(question, submission.answers[question.id])}</div>
              </div>
            ))}
          </div>

          {/* 版本注脚：用 border-t 与上方问答区分开，跟头部 border-b 对称。
              Version footnote separated by a border-t mirror of the header. */}
          <p className="border-border/50 border-t pt-3 text-muted-foreground text-xs">
            该记录基于 v{submission.version} 的快照；如已更新，请到「表单题」查看当前版本。
          </p>
        </article>
      ))}
    </div>
  );
}
