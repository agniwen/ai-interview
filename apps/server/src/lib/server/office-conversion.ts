import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

type RunCommand = (
  command: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<void>;

export type LegacyOfficeInputExtension = "doc" | "ppt" | "xls";
export type OoxmlOutputExtension = "docx" | "pptx" | "xlsx";

export interface ConvertLegacyOfficeToOoxmlOptions {
  bytes: Uint8Array;
  inputExtension: LegacyOfficeInputExtension;
  outputExtension: OoxmlOutputExtension;
  runCommand?: RunCommand;
  sofficeCommand?: string;
  tempDirFactory?: () => Promise<string>;
  timeoutMs?: number;
}

const execFileAsync = promisify(execFile);
const DEFAULT_OFFICE_CONVERSION_TIMEOUT_MS = 30_000;

async function defaultRunCommand(command: string, args: string[], options: { timeoutMs: number }) {
  await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs,
  });
}

export async function convertLegacyOfficeToOoxml({
  bytes,
  inputExtension,
  outputExtension,
  runCommand = defaultRunCommand,
  sofficeCommand = process.env.LIBREOFFICE_BIN?.trim() || "soffice",
  tempDirFactory = () => mkdtemp(path.join(tmpdir(), "arc-office-conversion-")),
  timeoutMs = DEFAULT_OFFICE_CONVERSION_TIMEOUT_MS,
}: ConvertLegacyOfficeToOoxmlOptions): Promise<Uint8Array> {
  const tempDir = await tempDirFactory();
  const profileDir = path.join(tempDir, "profile");
  const inputPath = path.join(tempDir, `document.${inputExtension}`);
  const outputPath = path.join(tempDir, `document.${outputExtension}`);

  try {
    await writeFile(inputPath, bytes);
    await runCommand(
      sofficeCommand,
      [
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--nodefault",
        "--norestore",
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--convert-to",
        outputExtension,
        "--outdir",
        tempDir,
        inputPath,
      ],
      { timeoutMs },
    );

    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
