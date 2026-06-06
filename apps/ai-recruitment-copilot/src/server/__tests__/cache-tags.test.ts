import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/db-schema/schema", () => ({ studioInterview: {} }));

// oxlint-disable-next-line import/first -- cache-tags imports DB at module load; mocks must be registered first.
import {
  cacheTags,
  configureCacheInvalidator,
  invalidateStudioInterviewCaches,
  resetCacheInvalidatorForTests,
  safeUpdateTag,
} from "@/server/cache-tags";

describe("cache tag invalidation", () => {
  afterEach(() => {
    resetCacheInvalidatorForTests();
    vi.restoreAllMocks();
  });

  it("is a no-op when no runtime cache invalidator is configured", () => {
    expect(() => safeUpdateTag("studio-interviews:org-1")).not.toThrow();
  });

  it("delegates individual and grouped invalidations to the configured adapter", () => {
    const revalidateTag = vi.fn();

    configureCacheInvalidator({ revalidateTag });
    safeUpdateTag(cacheTags.interviewConversationsByRecord("record-1"));
    invalidateStudioInterviewCaches("org-1");

    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, "interview-conversations-record-1");
    expect(revalidateTag).toHaveBeenNthCalledWith(2, "studio-interviews:org-1");
    expect(revalidateTag).toHaveBeenNthCalledWith(3, "studio-resumes:org-1");
  });

  it("keeps write paths alive when the configured invalidator throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    configureCacheInvalidator({
      revalidateTag: () => {
        throw new Error("cache unavailable");
      },
    });

    expect(() => safeUpdateTag("studio-interviews:org-1")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[cache-tags] revalidateTag("studio-interviews:org-1") failed:',
      expect.any(Error),
    );
  });
});
