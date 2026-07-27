"use client";

import type { CandidateAiReview } from "@arc/shared/interview/interview-record";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

function CandidateReviewRadar({ dimensions }: { dimensions: CandidateAiReview["dimensions"] }) {
  if (dimensions.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground text-sm">
        暂无匹配维度
      </div>
    );
  }

  return (
    <ChartContainer
      className="mx-auto aspect-square min-h-[17rem] w-full max-w-[20rem]"
      config={{ score: { color: "var(--primary)", label: "评分" } }}
    >
      <RadarChart
        accessibilityLayer
        data={dimensions}
        margin={{ bottom: 20, left: 24, right: 24, top: 20 }}
        outerRadius="70%"
      >
        <PolarGrid gridType="polygon" />
        <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <PolarRadiusAxis angle={90} axisLine={false} domain={[0, 100]} tick={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const dimension = item.payload as
                  | CandidateAiReview["dimensions"][number]
                  | undefined;
                return (
                  <div className="flex max-w-72 flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-6">
                      <span className="font-medium text-foreground">
                        {dimension?.label ?? "维度"}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {String(value)} 分
                      </span>
                    </div>
                    {dimension ? (
                      <p className="text-muted-foreground text-xs leading-5">
                        {dimension.rationale}
                      </p>
                    ) : null}
                  </div>
                );
              }}
              hideLabel
            />
          }
        />
        <Radar
          dataKey="score"
          dot={{ fill: "var(--color-score)", r: 3 }}
          fill="var(--color-score)"
          fillOpacity={0.18}
          name="评分"
          stroke="var(--color-score)"
          strokeWidth={2}
        />
      </RadarChart>
    </ChartContainer>
  );
}

export function CandidateAiReviewSection({ review }: { review: CandidateAiReview | null }) {
  const strengthsViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = strengthsViewportRef.current;
    if (!viewport) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (viewport.scrollWidth <= viewport.clientWidth) {
        return;
      }

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }

      const previousScrollLeft = viewport.scrollLeft;
      viewport.scrollLeft += delta;

      if (viewport.scrollLeft !== previousScrollLeft) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [review?.strengths.length]);

  return (
    <section className="pt-10 sm:pt-14">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] text-muted-foreground tracking-[0.16em]">03</span>
        <div>
          <h2 className="font-medium text-base tracking-tight sm:text-lg">AI 对您的初步了解</h2>
          <p className="mt-1 text-muted-foreground text-xs leading-6 sm:text-sm">
            基于您的简历与岗位要求，这里整理了邀请您面试的主要理由，方便您提前了解匹配点。仅供参考。
          </p>
        </div>
      </div>

      {review ? (
        <div className="mt-6">
          <div className="grid border-foreground/15 border-y lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:divide-x lg:divide-foreground/15">
            <div className="min-w-0 py-8 lg:pr-10">
              <h3 className="text-muted-foreground text-xs tracking-wide">匹配维度</h3>
              <CandidateReviewRadar dimensions={review.dimensions} />
            </div>

            <div className="flex min-w-0 flex-col justify-center border-foreground/15 border-t py-8 lg:border-t-0">
              <div className="lg:pl-10">
                <h3 className="text-muted-foreground text-xs tracking-wide">综合匹配度</h3>
                <span className="mt-4 block font-semibold text-6xl tabular-nums leading-none tracking-tighter">
                  {review.baseScore ?? "—"}
                </span>
              </div>
              <div className="mt-8 border-foreground/15 border-t pt-6 lg:pl-10">
                <h3 className="text-muted-foreground text-xs tracking-wide">匹配摘要</h3>
                <p className="mt-4 text-balance font-medium text-base leading-8 tracking-tight sm:text-lg">
                  {review.conclusion}
                </p>
              </div>
            </div>
          </div>

          <div className="py-8">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-muted-foreground text-xs tracking-wide">您的优势</h3>
            </div>
            {review.strengths.length > 0 ? (
              <ScrollArea
                className="mt-5 w-full"
                orientation="horizontal"
                scrollbarGutter
                scrollFade
                viewportClassName="pb-3"
                viewportRef={strengthsViewportRef}
              >
                <ol className="flex w-max min-w-full gap-4">
                  {review.strengths.map((strength, index) => (
                    <li
                      className="flex w-[min(28rem,85vw)] shrink-0 gap-3 rounded border border-foreground/15 bg-background/25 p-5"
                      key={`${strength.point}-${strength.evidence ?? ""}-${strength.impact}`}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-primary text-xs">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm leading-6 text-foreground">
                          {strength.point}
                        </h4>
                        {strength.evidence ? (
                          <p className="mt-1 text-muted-foreground text-sm leading-6">
                            {strength.evidence}
                          </p>
                        ) : null}
                        <p className="mt-3 text-foreground/70 text-sm leading-6">
                          <span className="text-muted-foreground">对岗位的价值：</span>
                          {strength.impact}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            ) : (
              <p className="mt-5 text-muted-foreground text-sm">暂无优势要点</p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 border-foreground/15 border-y py-4 text-center">
          <p className="font-medium text-sm">初步了解还在准备中</p>
          <p className="mt-2 text-muted-foreground text-sm">您可以先继续，不影响后续流程。</p>
        </div>
      )}
    </section>
  );
}
