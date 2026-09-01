import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const QUEUE_OWNER_BY_TOKEN = {
  MAIL_INGEST_TRIGGER_QUEUE_NAME: "candidate-lifecycle",
  MEETING_ANSWER_QUEUE_NAME: "meetings",
  MEETING_INTELLIGENCE_QUEUE_NAME: "meetings",
  MEETING_PLAYBACK_QUEUE_NAME: "meetings",
  MEETING_PURGE_QUEUE_NAME: "meetings",
  MEETING_TRANSCRIPTION_QUEUE_NAME: "meetings",
  RESUME_PARSE_QUEUE_NAME: "candidate-lifecycle",
  RESUME_REVIEW_GENERATION_QUEUE_NAME: "candidate-lifecycle",
  RESUME_SEMANTIC_INDEX_QUEUE_NAME: "candidate-lifecycle",
} as const;

describe("background queue ownership", () => {
  it("assigns every BullMQ processor to the domain whose state it changes", async () => {
    const processorFiles = [
      {
        owner: "candidate-lifecycle",
        path: resolve(
          import.meta.dirname,
          "candidate-lifecycle/workloads/bullmq/candidate-bullmq.processors.ts",
        ),
      },
      {
        owner: "meetings",
        path: resolve(
          import.meta.dirname,
          "meetings/workloads/bullmq/meeting-bullmq.processors.ts",
        ),
      },
    ] as const;
    const processorQueueTokens: string[] = [];
    for (const processorFile of processorFiles) {
      const sourceText = await readFile(processorFile.path, "utf-8");
      const source = ts.createSourceFile(
        processorFile.path,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "Processor" &&
          ts.isIdentifier(node.arguments[0])
        ) {
          const queueToken = node.arguments[0].text;
          processorQueueTokens.push(queueToken);
          const ownerEntry = Object.entries(QUEUE_OWNER_BY_TOKEN).find(
            ([token]) => token === queueToken,
          );
          expect(ownerEntry?.[1]).toBe(processorFile.owner);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(processorQueueTokens).toHaveLength(9);
    expect(processorQueueTokens.toSorted()).toEqual(Object.keys(QUEUE_OWNER_BY_TOKEN).toSorted());
    expect(new Set(Object.values(QUEUE_OWNER_BY_TOKEN))).toEqual(
      new Set(["candidate-lifecycle", "meetings"]),
    );
  });
});
