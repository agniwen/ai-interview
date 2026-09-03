import { db } from "../db";
import { createResumeIngest } from "@app/resume-processing/ingest";
import { Data, Effect } from "effect";

const resumeIngest = createResumeIngest(db);
export const { recoverIncompleteBatchItems } = resumeIngest;

class ResumeIngestFailure extends Data.TaggedError("ResumeIngestFailure")<{
  readonly cause: unknown;
}> {}

export const runBulkResumeUploadWorkflowEffect = (
  input: Parameters<typeof resumeIngest.runBulkResumeUploadWorkflow>[0],
) =>
  Effect.tryPromise({
    catch: (cause) => new ResumeIngestFailure({ cause }),
    try: () => resumeIngest.runBulkResumeUploadWorkflow(input),
  });

export const runBulkResumeUploadWorkflow = async (
  input: Parameters<typeof resumeIngest.runBulkResumeUploadWorkflow>[0],
) => {
  await Effect.runPromise(
    runBulkResumeUploadWorkflowEffect(input).pipe(
      Effect.catchTag("ResumeIngestFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
};
