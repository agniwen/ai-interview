import { describe, expect, it, vi } from "vitest";
import {
  createBulkResumeUploadWorkflow,
  runBulkResumeUploadWorkflow,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/bulk-resume-upload-workflow";

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
      },
      workflow,
    );

    expect(processItem).toHaveBeenCalledWith("item-1", {
      bypassCache: true,
    });
    expect(result).toEqual({
      batch: { id: "batch-1" },
      done: false,
      item: { id: "item-1" },
    });
  });
});
