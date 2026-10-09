import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { convertLegacyOfficeToOoxml } from "../office-conversion";

describe("convertLegacyOfficeToOoxml", () => {
  it("converts legacy Office files through LibreOffice and cleans up temp files", async () => {
    let tempDir = "";
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      const outdirIndex = args.indexOf("--outdir");
      if (outdirIndex === -1) {
        throw new Error("missing outdir");
      }
      const outputDir = args[outdirIndex + 1];
      if (!outputDir) {
        throw new Error("missing output dir");
      }
      await writeFile(path.join(outputDir, "document.docx"), Buffer.from("converted-docx"));
    });

    const result = await convertLegacyOfficeToOoxml({
      bytes: new Uint8Array([1, 2, 3]),
      inputExtension: "doc",
      outputExtension: "docx",
      runCommand,
      sofficeCommand: "soffice-test",
      tempDirFactory: async () => {
        tempDir = await mkdtemp(path.join(tmpdir(), "office-conversion-test-"));
        return tempDir;
      },
      timeoutMs: 1234,
    });

    expect(result).toEqual(new Uint8Array(Buffer.from("converted-docx")));
    expect(runCommand).toHaveBeenCalledWith(
      "soffice-test",
      expect.arrayContaining([
        "--headless",
        "--convert-to",
        "docx",
        "--outdir",
        tempDir,
        path.join(tempDir, "document.doc"),
      ]),
      { timeoutMs: 1234 },
    );
    expect(
      runCommand.mock.calls[0]?.[1].some((arg) => arg.startsWith("-env:UserInstallation=file://")),
    ).toBe(true);
    await expect(readFile(path.join(tempDir, "document.doc"))).rejects.toThrow();
    await expect(access(tempDir)).rejects.toThrow();
  });
});
