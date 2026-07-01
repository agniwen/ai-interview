import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processBatchItem: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor",
  () => ({
    processBatchItem: mocks.processBatchItem,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting
import { runBulkResumeUploadWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/bulk-resume-upload-workflow";

describe("runBulkResumeUploadWorkflow", () => {
  it("processes one upload item through the workflow runner", async () => {
    mocks.processBatchItem.mockResolvedValue({
      batch: { id: "batch-1" },
      done: false,
      item: { id: "item-1" },
    });

    const result = await runBulkResumeUploadWorkflow({ itemId: "item-1" });

    expect(mocks.processBatchItem).toHaveBeenCalledWith("item-1");
    expect(result).toEqual({
      batch: { id: "batch-1" },
      done: false,
      item: { id: "item-1" },
    });
  });
});
