import { db } from "../db";
import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import { Data, Effect } from "effect";

const semantic = createResumeSemanticProcessing(db);
export const { listRecoverableResumeSemanticIndexJobs } = semantic;

class ResumeSemanticFailure extends Data.TaggedError("ResumeSemanticFailure")<{
  readonly cause: unknown;
}> {}

function semanticEffect<A>(evaluate: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) => new ResumeSemanticFailure({ cause }),
    try: evaluate,
  });
}

function runSemantic<A>(effect: Effect.Effect<A, ResumeSemanticFailure>) {
  return Effect.runPromise(
    effect.pipe(Effect.catchTag("ResumeSemanticFailure", (failure) => Effect.fail(failure.cause))),
  );
}

export const runJdSemanticIndexJobEffect = (
  input: Parameters<typeof semantic.runJdSemanticIndexJob>[0],
) => semanticEffect(() => semantic.runJdSemanticIndexJob(input));
export const runJdSemanticIndexJob = (
  input: Parameters<typeof semantic.runJdSemanticIndexJob>[0],
) => runSemantic(runJdSemanticIndexJobEffect(input));

export const runResumeSemanticEnrichmentJobEffect = (
  input: Parameters<typeof semantic.runResumeSemanticEnrichmentJob>[0],
) => semanticEffect(() => semantic.runResumeSemanticEnrichmentJob(input));
export const runResumeSemanticEnrichmentJob = (
  input: Parameters<typeof semantic.runResumeSemanticEnrichmentJob>[0],
) => runSemantic(runResumeSemanticEnrichmentJobEffect(input));
