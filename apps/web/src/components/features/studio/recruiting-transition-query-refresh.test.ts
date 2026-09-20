import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { advancePipelineStage } from "./studio-person-detail-sections";

describe("招聘阶段变化后的详情刷新", () => {
  it("进入 Offer 时刷新已被回退操作失效的 Offer 列表", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["studio-resumes", "light", "detail", "candidate"], {
      pipelineStage: "salary_negotiation",
      version: 60,
    });
    queryClient.setQueryData(
      ["offer-drafts", "light", "candidate"],
      [{ id: "historical-offer", status: "accepted" }],
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const dependencies = {
      fetchStudioResume: vi.fn(),
      transitionInterviewRecord: vi.fn().mockResolvedValue({}),
    };

    const error = await advancePipelineStage(
      {
        queryClient,
        recordId: "candidate",
        slug: "light",
        target: "offer",
      },
      dependencies,
    );

    expect(error).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["offer-drafts", "light", "candidate"],
    });
  });
});
