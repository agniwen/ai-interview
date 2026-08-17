import { describe, expect, it, vi } from "vitest";
import {
  buildMeetingAnswerJobId,
  buildMeetingAnswerQueuePrefix,
  meetingAnswerJobSchema,
  reconcileMeetingAnswerJob,
} from "./meeting-answer";

describe("Meeting Answer queue", () => {
  it("isolates queues by database and uses one stable job per exchange", () => {
    const env = {
      DATABASE_URL: "postgres://arc@example.test:5432/meeting_answer",
    } satisfies NodeJS.ProcessEnv;
    expect(buildMeetingAnswerQueuePrefix(env)).toMatch(/^arc:meeting-answer:/);
    expect(buildMeetingAnswerJobId({ exchangeId: "exchange:81" })).toBe(
      "meeting-answer-exchange-81",
    );
    expect(meetingAnswerJobSchema.parse({ exchangeId: "exchange-81" })).toEqual({
      exchangeId: "exchange-81",
    });
  });

  it("does not enqueue another active delivery for the same exchange", async () => {
    const add = vi.fn();
    await reconcileMeetingAnswerJob(
      {
        add,
        getJob: vi.fn().mockResolvedValue({
          getState: vi.fn().mockResolvedValue("active"),
          remove: vi.fn(),
        }),
      },
      { exchangeId: "exchange-81" },
    );
    expect(add).not.toHaveBeenCalled();
  });
});
