// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import type {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  markMeetingAnswerFailed,
  publishMeetingAnswerExchange,
} from "./dao";
import type { generateMeetingAnswer, getMeetingAnswerGeneratorSnapshot } from "./generator";
import type { MeetingAnswerJobData } from "@app/meeting-processing-queue/meeting-answer";
import { MEETING_ANSWER_PROMPT_VERSION } from "@app/meeting-processing-queue/meeting-answer";
import {
  isMeetingAnswerTerminalError,
  MeetingAnswerTerminalError,
} from "@app/shared/meeting-answer";
import { Cause, Context, Data, Effect, Layer } from "effect";

export interface MeetingAnswerDependencies {
  claim: typeof claimMeetingAnswerExchange;
  createExecutionToken: () => string;
  generate: typeof generateMeetingAnswer;
  generatorSnapshot: typeof getMeetingAnswerGeneratorSnapshot;
  loadContext: typeof loadMeetingAnswerContext;
  markFailed: typeof markMeetingAnswerFailed;
  publish: typeof publishMeetingAnswerExchange;
}

export class MeetingAnswerProcessor extends Context.Service<
  MeetingAnswerProcessor,
  MeetingAnswerDependencies
>()("@app/worker/MeetingAnswerProcessor") {}

export const meetingAnswerProcessorLayer = (dependencies: MeetingAnswerDependencies) =>
  Layer.succeed(MeetingAnswerProcessor, dependencies);

class MeetingAnswerFailure extends Data.TaggedError("MeetingAnswerFailure")<{
  readonly cause: unknown;
  readonly operation:
    | "claim"
    | "generate"
    | "generator-snapshot"
    | "load-context"
    | "mark-failed"
    | "publish";
}> {}

function attempt<A>(operation: MeetingAnswerFailure["operation"], evaluate: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) => new MeetingAnswerFailure({ cause, operation }),
    try: evaluate,
  });
}

export function runMeetingAnswerProcessingEffect(
  input: MeetingAnswerJobData,
  context: { attempt: number; maxAttempts: number },
): Effect.Effect<void, MeetingAnswerFailure, MeetingAnswerProcessor> {
  return Effect.gen(function* () {
    const dependencies = yield* MeetingAnswerProcessor;
    const executionToken = dependencies.createExecutionToken();
    const claim = yield* attempt("claim", () =>
      dependencies.claim({
        attempt: context.attempt,
        exchangeId: input.exchangeId,
        executionToken,
      }),
    );
    if (claim.status !== "claimed") {
      return;
    }
    const outcome = yield* Effect.gen(function* outcome() {
      const generator = yield* Effect.try({
        catch: (cause) => new MeetingAnswerFailure({ cause, operation: "generator-snapshot" }),
        try: dependencies.generatorSnapshot,
      });
      if (
        generator.provider !== claim.provider ||
        generator.model !== claim.model ||
        claim.promptVersion !== MEETING_ANSWER_PROMPT_VERSION
      ) {
        return yield* Effect.fail(
          new MeetingAnswerFailure({
            cause: new MeetingAnswerTerminalError("Meeting Answer generator snapshot 已变化"),
            operation: "generator-snapshot",
          }),
        );
      }
      const answerContext = yield* attempt("load-context", () =>
        dependencies.loadContext({
          exchangeId: input.exchangeId,
          executionToken,
        }),
      );
      if (!answerContext) {
        return;
      }
      const answer = yield* attempt("generate", () =>
        dependencies.generate({ ...answerContext, question: claim.question }),
      );
      yield* attempt("publish", () =>
        dependencies.publish({ answer, exchangeId: input.exchangeId, executionToken }),
      );
    }).pipe(Effect.exit);
    if (outcome._tag === "Success") {
      return;
    }
    const failureReason = outcome.cause.reasons.find(Cause.isFailReason);
    if (!failureReason) {
      return yield* Effect.failCause(outcome.cause);
    }
    const failure = failureReason.error;
    const error = failure.cause;
    const terminal = isMeetingAnswerTerminalError(error) || context.attempt >= context.maxAttempts;
    yield* attempt("mark-failed", () =>
      dependencies.markFailed({
        exchangeId: input.exchangeId,
        executionToken,
        terminal,
      }),
    );
    if (!terminal) {
      return yield* Effect.fail(failure);
    }
  });
}

export async function runMeetingAnswerProcessing(
  input: MeetingAnswerJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingAnswerDependencies,
): Promise<void> {
  await Effect.runPromise(
    runMeetingAnswerProcessingEffect(input, context).pipe(
      Effect.provide(meetingAnswerProcessorLayer(dependencies)),
      Effect.catchTag("MeetingAnswerFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
