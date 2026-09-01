import { rawBackendEnvironment } from "../../config/raw-backend-environment.js";
import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { WorkspaceDocumentPreviewPort } from "./workspace.ports.js";

const execFileAsync = promisify(execFile);

async function convertPptxToPdf(input: {
  bytes: Uint8Array;
  filename: string;
}): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), "arc-pptx-preview-"));
  const source = join(directory, "document.pptx");
  const output = join(directory, "document.pdf");
  try {
    await writeFile(source, input.bytes);
    await execFileAsync(
      rawBackendEnvironment.LIBREOFFICE_BIN?.trim() || "soffice",
      ["--headless", "--convert-to", "pdf:impress_pdf_Export", "--outdir", directory, source],
      { maxBuffer: 1024 * 1024, timeout: 30_000 },
    );
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

@Injectable()
export class WorkspaceDocumentPreviewAdapter implements WorkspaceDocumentPreviewPort {
  private readonly converter = convertPptxToPdf;

  pptxToPdf(input: { bytes: Uint8Array; filename: string }): Promise<Uint8Array> {
    return this.converter(input);
  }
}
