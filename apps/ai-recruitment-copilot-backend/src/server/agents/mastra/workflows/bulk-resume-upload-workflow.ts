import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { processBatchItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor";

const bulkResumeUploadInputSchema = z.object({
  bypassCache: z.boolean().optional(),
  itemId: z.string().trim().min(1),
});

const bulkResumeUploadOutputSchema = z.object({
  batch: z.unknown().nullable(),
  done: z.boolean(),
  item: z.unknown().nullable(),
});

export type BulkResumeUploadWorkflowOutput = z.infer<typeof bulkResumeUploadOutputSchema>;

export interface BulkResumeUploadWorkflowDeps {
  processItem: (
    itemId: string,
    options?: { bypassCache?: boolean },
  ) => ReturnType<typeof processBatchItem>;
}

export function createBulkResumeUploadWorkflow(deps: BulkResumeUploadWorkflowDeps) {
  const processItemStep = createStep({
    execute: async ({ inputData }) => {
      const result = await deps.processItem(inputData.itemId, {
        bypassCache: inputData.bypassCache,
      });
      return {
        batch: result?.batch ?? null,
        done: Boolean(result?.done),
        item: result?.item ?? null,
      };
    },
    id: "process-bulk-upload-item",
    inputSchema: bulkResumeUploadInputSchema,
    outputSchema: bulkResumeUploadOutputSchema,
  });

  return (
    createWorkflow({
      description: "Process one claimed item in a bulk resume upload batch.",
      id: "bulk-resume-upload-item-workflow",
      inputSchema: bulkResumeUploadInputSchema,
      outputSchema: bulkResumeUploadOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(processItemStep)
      .commit()
  );
}

export const bulkResumeUploadWorkflow = createBulkResumeUploadWorkflow({
  processItem: processBatchItem,
});

export async function runBulkResumeUploadWorkflow(
  input: {
    bypassCache?: boolean;
    itemId: string;
  },
  workflow = bulkResumeUploadWorkflow,
): Promise<BulkResumeUploadWorkflowOutput> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === "success") {
    return result.result;
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Bulk resume upload workflow ended with status ${result.status}.`);
}
