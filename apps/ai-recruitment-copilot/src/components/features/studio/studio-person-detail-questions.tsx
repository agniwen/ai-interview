import { DIFFICULTY_LABEL } from "@arc/shared/interview-question-difficulty";
import { cn } from "@arc/shared/utils";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { TabsContent } from "@/components/ui/tabs";
import { truncateText } from "./interviews/interview-detail/helpers";

export function StudioPersonDetailQuestionsTab({
  mode,
  questions,
}: {
  mode: "interview" | "resume";
  questions: { difficulty: keyof typeof DIFFICULTY_LABEL; order: number; question: string }[];
}) {
  if (mode !== "interview") {
    return null;
  }
  return (
    <TabsContent value="questions">
      <Frame>
        <FrameHeader>
          <FrameTitle>AI 面试题</FrameTitle>
        </FrameHeader>
        {questions.length > 0 ? (
          questions.map((question, index) => (
            <FramePanel
              className={cn(
                "p-4",
                questions.length > 1 && index === 0 && "rounded-b-[2px] before:rounded-b-[1px]",
                index > 0 && index < questions.length - 1 && "rounded-[2px] before:rounded-[1px]",
                questions.length > 1 &&
                  index === questions.length - 1 &&
                  "rounded-t-[2px] before:rounded-t-[1px]",
              )}
              key={question.order}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="font-medium text-sm">第{question.order} 题</span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
                </span>
              </div>
              <MarkdownView
                className="mt-2 text-sm leading-normal"
                content={truncateText(question.question)}
              />
            </FramePanel>
          ))
        ) : (
          <FramePanel className="p-4">
            <p className="text-muted-foreground text-sm">暂无面试题，可通过上传简历自动生成。</p>
          </FramePanel>
        )}
      </Frame>
    </TabsContent>
  );
}
