// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import type {
  createHumanInterviewEvaluationWorkerDao,
  generateHumanInterviewEvaluation,
} from "@app/meeting-processing/human-interview";
import type { HumanInterviewEvaluationJobData } from "@app/meeting-processing-queue/human-interview-evaluation";
import { Cause, Context, Data, Effect, Layer } from "effect";

export interface HumanInterviewEvaluationProcessorDependencies {
  generate: typeof generateHumanInterviewEvaluation;
  loadInput: ReturnType<
    typeof createHumanInterviewEvaluationWorkerDao
  >["loadHumanInterviewEvaluationInput"];
  markFailed: ReturnType<
    typeof createHumanInterviewEvaluationWorkerDao
  >["markHumanInterviewEvaluationFailed"];
  notifyReady: (input: HumanInterviewEvaluationJobData) => Promise<void>;
  publish: ReturnType<
    typeof createHumanInterviewEvaluationWorkerDao
  >["publishHumanInterviewEvaluation"];
}

export class HumanInterviewEvaluationProcessor extends Context.Service<
  HumanInterviewEvaluationProcessor,
  HumanInterviewEvaluationProcessorDependencies
>()("@app/worker/HumanInterviewEvaluationProcessor") {}

export const humanInterviewEvaluationProcessorLayer = (
  dependencies: HumanInterviewEvaluationProcessorDependencies,
) => Layer.succeed(HumanInterviewEvaluationProcessor, dependencies);

class HumanInterviewEvaluationFailure extends Data.TaggedError("HumanInterviewEvaluationFailure")<{
  readonly cause: unknown;
  readonly operation: "generate" | "load-input" | "mark-failed" | "notify-ready" | "publish";
}> {}

function attempt<A>(
  operation: HumanInterviewEvaluationFailure["operation"],
  evaluate: () => Promise<A>,
) {
  return Effect.tryPromise({
    catch: (cause) => new HumanInterviewEvaluationFailure({ cause, operation }),
    try: evaluate,
  });
}

export function runHumanInterviewEvaluationProcessingEffect(
  input: HumanInterviewEvaluationJobData,
  context: { attempt: number; maxAttempts: number },
) {
  return Effect.gen(function* () {
    const dependencies = yield* HumanInterviewEvaluationProcessor;
    const outcome = yield* Effect.gen(function* outcome() {
      const source = yield* attempt("load-input", () => dependencies.loadInput(input));
      if (!source) {
        return;
      }
      const evaluation = yield* attempt("generate", () =>
        dependencies.generate({
          ...source,
          salaryRange: null,
        }),
      );
      yield* attempt("publish", () =>
        dependencies.publish({
          evaluation,
          meetingSessionId: input.meetingSessionId,
          organizationId: input.organizationId,
          roundId: input.roundId,
          transcriptRevisionId: input.transcriptRevisionId,
        }),
      );
    }).pipe(Effect.exit);

    if (outcome._tag === "Success") {
      yield* attempt("notify-ready", () => dependencies.notifyReady(input));
      return;
    }
    const failureReason = outcome.cause.reasons.find(Cause.isFailReason);
    if (!failureReason) {
      return yield* Effect.failCause(outcome.cause);
    }
    const failure = failureReason.error;
    if (context.attempt < context.maxAttempts) {
      return yield* Effect.fail(failure);
    }
    const message =
      failure.cause instanceof Error ? failure.cause.message : "真人复面 AI 评价生成失败";
    yield* attempt("mark-failed", () =>
      dependencies.markFailed({
        error: `AI 评价生成失败：${message}`,
        roundId: input.roundId,
        transcriptRevisionId: input.transcriptRevisionId,
      }),
    );
  });
}

export async function runHumanInterviewEvaluationProcessing(
  input: HumanInterviewEvaluationJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: HumanInterviewEvaluationProcessorDependencies,
): Promise<void> {
  await Effect.runPromise(
    runHumanInterviewEvaluationProcessingEffect(input, context).pipe(
      Effect.provide(humanInterviewEvaluationProcessorLayer(dependencies)),
      Effect.catchTag("HumanInterviewEvaluationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
