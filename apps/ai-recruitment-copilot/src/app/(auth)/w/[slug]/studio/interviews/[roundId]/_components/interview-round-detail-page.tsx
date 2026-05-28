"use client";

// 候选人面试详情独立页 —— 走 StudioPersonDetailPanel 的 page-shell 形态。
// 顶部一行返回按钮 + 标题 + tabs 与简历预览,主体撑满剩余空间。所有数据获取
// 仍由 panel 自己处理。
//
// Full-page route for the candidate interview detail view. Uses the panel's
// page shell: a single header row (back button + title + tabs + resume preview),
// body fills the remaining height. Data loading stays inside the panel.

import { ChevronLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StudioPersonDetailPanel } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-detail-panel";

export function InterviewRoundDetailPage({ slug, roundId }: { slug: string; roundId: string }) {
  const { push } = useRouter();
  const queryClient = useQueryClient();

  return (
    <StudioPersonDetailPanel
      // URL 段名叫 [roundId] 是历史命名;实际进来的值既可能是 roundId,也可能是
      // 历史飞书卡片里的 studio_interview.id。通过 recordId prop 喂给 Panel,
      // 内部 resolver 同时尝试两种 id 类型,语义最宽容。
      // The [roundId] segment carries either a real roundId or a legacy
      // studio_interview.id from old Feishu cards. Feeding it via `recordId`
      // lets the Panel's resolver try both id flavors transparently.
      mode="interview"
      onUpdated={() => {
        // 与列表页 invalidateAll 行为对齐 —— 轮次写操作会影响简历库标记。
        // Mirror the list page's invalidateAll: round writes can flip the
        // hasInterviewRounds flag on the resume side.
        void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
        void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
        void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
      }}
      recordId={roundId}
      shell={({ body, description, headerExtra, title }) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div>
              <Button
                onClick={() => push(`/w/${slug}/studio/interviews`)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon className="size-4" />
                返回
              </Button>
            </div>
            <header className="flex flex-col gap-2">
              <h1 className="text-2xl">{title}</h1>
              {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
            </header>
            {headerExtra}
          </div>
          <div>{body}</div>
        </div>
      )}
    />
  );
}
