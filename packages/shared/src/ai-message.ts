import type {
  ArcFilePart,
  ArcMessage,
  ArcMessagePart,
  ArcMessageRole,
  ArcReasoningPart,
  ArcSourcePart,
  ArcTextPart,
  ArcToolPart,
} from "@arc/db-schema/ai-message";

export type {
  ArcFilePart,
  ArcMessage,
  ArcMessagePart,
  ArcMessageRole,
  ArcReasoningPart,
  ArcSourcePart,
  ArcTextPart,
  ArcToolPart,
};

export function isArcFilePart(part: ArcMessagePart | unknown): part is ArcFilePart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "file" &&
    typeof (part as { mediaType?: unknown }).mediaType === "string"
  );
}

export function getArcFileName(part: ArcFilePart): string | undefined {
  return part.filename?.trim() || part.name?.trim() || undefined;
}

export function getArcFileUrl(part: ArcFilePart): string | undefined {
  return part.url?.trim() || part.data?.trim() || undefined;
}
