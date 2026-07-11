import Markdown from "react-markdown";
import { DIFFICULTY_LABEL } from "@arc/shared/interview-question-difficulty";
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
      <section className="space-y-4">
        <h3 className="font-medium text-sm">AI 面试题</h3>
        <div className="flex flex-col gap-3">
          {questions.length > 0 ? (
            questions.map((question) => (
              <article
                className="rounded-xl border border-muted/60 bg-muted/30 px-4 py-3"
                key={question.order}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <span className="font-medium text-sm">第{question.order} 题</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-normal">
                  <Markdown>{truncateText(question.question)}</Markdown>
                </div>
              </article>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">暂无面试题，可通过上传简历自动生成。</p>
          )}
        </div>
      </section>
    </TabsContent>
  );
}
