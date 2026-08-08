import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CreateSmallSavedMeetingInput,
  MeetingSourceTrack,
  MultipartMeetingUploadInstruction,
  MultipartSavedMeetingDescriptor,
} from "@arc/shared/meeting-recording";

interface LocalMultipartFragment {
  localPath: string;
  sequence: number;
  sizeBytes: number;
  track: MeetingSourceTrack;
}

const MULTIPART_UPLOAD_CONCURRENCY = 4;

export interface MeetingObjectUploadInput {
  body: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
  sizeBytes: number;
  url: string;
}

export type MeetingObjectUploader = (input: MeetingObjectUploadInput) => Promise<void>;

export async function uploadMeetingObject(input: MeetingObjectUploadInput): Promise<void> {
  const response = await fetch(input.url, {
    body: input.body,
    duplex: "half",
    headers: { ...input.headers, "content-length": String(input.sizeBytes) },
    method: "PUT",
  } as RequestInit & { duplex: "half" });
  if (!response.ok) {
    throw new Error(`录音对象上传失败 (${response.status})`);
  }
}

async function readTrackRangeBytes(input: {
  captureDirectory: string;
  fragments: LocalMultipartFragment[];
  offsetBytes: number;
  sizeBytes: number;
}): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let logicalOffset = 0;
  const rangeEnd = input.offsetBytes + input.sizeBytes;
  for (const fragment of input.fragments) {
    const fragmentEnd = logicalOffset + fragment.sizeBytes;
    if (fragmentEnd > input.offsetBytes && logicalOffset < rangeEnd) {
      const bytes = await readFile(join(input.captureDirectory, fragment.localPath));
      const start = Math.max(0, input.offsetBytes - logicalOffset);
      const end = Math.min(fragment.sizeBytes, rangeEnd - logicalOffset);
      chunks.push(bytes.subarray(start, end));
    }
    logicalOffset = fragmentEnd;
    if (logicalOffset >= rangeEnd) {
      break;
    }
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.byteLength !== input.sizeBytes) {
    throw new Error("本地录音 multipart 字节范围不完整");
  }
  return bytes;
}

function trackRangeStream(
  input: Parameters<typeof readTrackRangeBytes>[0],
): ReadableStream<Uint8Array> {
  let delivered = false;
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      if (delivered) {
        controller.close();
        return;
      }
      delivered = true;
      controller.enqueue(await readTrackRangeBytes(input));
    },
  });
}

function trackFragments(
  fragments: LocalMultipartFragment[],
  track: MeetingSourceTrack,
): LocalMultipartFragment[] {
  return fragments
    .filter((fragment) => fragment.track === track)
    .toSorted((left, right) => left.sequence - right.sequence);
}

export async function describeLocalMeetingMultipart(input: {
  captureDirectory: string;
  descriptor: CreateSmallSavedMeetingInput;
  fragments: LocalMultipartFragment[];
  partSizeBytes: number;
}): Promise<MultipartSavedMeetingDescriptor> {
  return {
    ...input.descriptor,
    assets: await Promise.all(
      input.descriptor.assets.map(async (asset) => {
        const fragments = trackFragments(input.fragments, asset.track);
        const parts: MultipartSavedMeetingDescriptor["assets"][number]["parts"] = [];
        for (
          let offsetBytes = 0, partNumber = 1;
          offsetBytes < asset.sizeBytes;
          offsetBytes += input.partSizeBytes, partNumber += 1
        ) {
          const sizeBytes = Math.min(input.partSizeBytes, asset.sizeBytes - offsetBytes);
          const bytes = await readTrackRangeBytes({
            captureDirectory: input.captureDirectory,
            fragments,
            offsetBytes,
            sizeBytes,
          });
          parts.push({
            md5Base64: createHash("md5").update(bytes).digest("base64"),
            offsetBytes,
            partNumber,
            sizeBytes,
          });
        }
        return { ...asset, parts };
      }),
    ),
  };
}

export async function uploadLocalMeetingMultipart(input: {
  captureDirectory: string;
  descriptor: MultipartSavedMeetingDescriptor;
  fragments: LocalMultipartFragment[];
  instructions: MultipartMeetingUploadInstruction[];
  isAllowedUploadUrl: (url: URL) => boolean;
  putObject: MeetingObjectUploader;
}): Promise<void> {
  const assets = new Map(input.descriptor.assets.map((asset) => [asset.track, asset]));
  let nextInstruction = 0;
  let uploadError: Error | undefined;
  const uploadNext = async (): Promise<void> => {
    while (!uploadError && nextInstruction < input.instructions.length) {
      const instruction = input.instructions[nextInstruction];
      nextInstruction += 1;
      if (!instruction) {
        return;
      }
      const asset = assets.get(instruction.track);
      const part = asset?.parts.find(
        (candidate) => candidate.partNumber === instruction.partNumber,
      );
      if (
        !asset ||
        !part ||
        instruction.method !== "PUT" ||
        instruction.offsetBytes !== part.offsetBytes ||
        instruction.sizeBytes !== part.sizeBytes ||
        instruction.headers["content-md5"] !== part.md5Base64
      ) {
        throw new Error(`${instruction.track} multipart 上传指令与本地录音不匹配`);
      }
      const url = new URL(instruction.url);
      if (!input.isAllowedUploadUrl(url)) {
        throw new Error("录音上传地址不属于已配置的 Recording R2");
      }
      try {
        await input.putObject({
          body: trackRangeStream({
            captureDirectory: input.captureDirectory,
            fragments: trackFragments(input.fragments, instruction.track),
            offsetBytes: instruction.offsetBytes,
            sizeBytes: instruction.sizeBytes,
          }),
          headers: { "content-md5": part.md5Base64 },
          sizeBytes: part.sizeBytes,
          url: instruction.url,
        });
      } catch (error) {
        uploadError = error instanceof Error ? error : new Error("录音 multipart part 上传失败");
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MULTIPART_UPLOAD_CONCURRENCY, input.instructions.length) }, () =>
      uploadNext(),
    ),
  );
  if (uploadError) {
    throw new Error(uploadError.message, { cause: uploadError });
  }
}
