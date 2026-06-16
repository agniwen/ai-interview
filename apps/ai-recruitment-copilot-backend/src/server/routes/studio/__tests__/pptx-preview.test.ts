import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PPTX preview conversion", () => {
  it("converts PPTX bytes to a generated PDF buffer", async () => {
    const pptxPreview =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview");
    const calls: { args: string[]; command: string }[] = [];

    const pdf = await pptxPreview.convertPptxToPdf(new Uint8Array([1, 2, 3]), {
      runCommand: async (command, args) => {
        calls.push({ args, command });
        const outdirIndex = args.indexOf("--outdir");
        const inputPath = args.at(-1);
        expect(outdirIndex).toBeGreaterThanOrEqual(0);
        expect(inputPath).toBeTruthy();

        const outputPath = path.join(
          args[outdirIndex + 1],
          `${path.basename(inputPath as string, ".pptx")}.pdf`,
        );
        await writeFile(outputPath, new Uint8Array([4, 5, 6]));
      },
      tempDirFactory: () => mkdtemp(path.join(tmpdir(), "pptx-preview-test-")),
    });

    expect(pdf).toEqual(new Uint8Array([4, 5, 6]));
    expect(calls).toEqual([
      {
        args: expect.arrayContaining(["--headless", "--convert-to", "pdf:impress_pdf_Export"]),
        command: "soffice",
      },
    ]);
  });
});
