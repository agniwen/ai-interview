import { describe, expect, it, vi } from "vitest";
import {
  createBulkResumeUploadWorkflow,
  runBulkResumeUploadWorkflow,
} from "@app/server/server/agents/mastra/workflows/bulk-resume-upload-workflow";

describe("runBulkResumeUploadWorkflow", () => {
  it("processes one upload item through the workflow runner", async () => {
    const processItem = vi.fn().mockResolvedValue({
      batch: { id: "batch-1" },
      done: false,
      item: { id: "item-1" },
    });
    const workflow = createBulkResumeUploadWorkflow({ processItem });

    const result = await runBulkResumeUploadWorkflow(
      {
        bypassCache: true,
        itemId: "item-1",
        retryParseFailure: true,
      },
      workflow,
    );

    expect(processItem).toHaveBeenCalledWith("item-1", {
      bypassCache: true,
      retryParseFailure: true,
    });
    expect(result).toEqual({
      batch: { id: "batch-1" },
      done: false,
      item: { id: "item-1" },
    });
  });
});
