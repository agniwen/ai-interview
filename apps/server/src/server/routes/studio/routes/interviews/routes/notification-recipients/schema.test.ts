import { describe, expect, it } from "vitest";
import { replaceInterviewNotificationRecipientsSchema } from "./schema";

describe("notification recipient input", () => {
  it("accepts an empty list as initiator fallback", () => {
    expect(replaceInterviewNotificationRecipientsSchema.parse({ userIds: [] })).toEqual({
      userIds: [],
    });
  });

  it("rejects duplicate users", () => {
    expect(
      replaceInterviewNotificationRecipientsSchema.safeParse({ userIds: ["user_1", "user_1"] })
        .success,
    ).toBe(false);
  });
});
