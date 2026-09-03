import { db } from "../db";
import { createResumeReview } from "@app/resume-processing/review";
import { Data, Effect } from "effect";

const resumeReview = createResumeReview(db);

class ResumeReviewFailure extends Data.TaggedError("ResumeReviewFailure")<{
  readonly cause: unknown;
}> {}

export const processResumeReviewGenerationJobEffect = (
  ...args: Parameters<typeof resumeReview.processResumeReviewGenerationJob>
) =>
  Effect.tryPromise({
    catch: (cause) => new ResumeReviewFailure({ cause }),
    try: () => resumeReview.processResumeReviewGenerationJob(...args),
  });

export const processResumeReviewGenerationJob = (
  ...args: Parameters<typeof resumeReview.processResumeReviewGenerationJob>
) =>
  Effect.runPromise(
    processResumeReviewGenerationJobEffect(...args).pipe(
      Effect.catchTag("ResumeReviewFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
