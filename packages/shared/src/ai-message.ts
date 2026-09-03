import type {
  ArcFilePart,
  ArcMessage,
  ArcMessagePart,
  ArcMessageRole,
  ArcReasoningPart,
  ArcSourcePart,
  ArcTextPart,
  ArcToolPart,
} from "@app/db-schema/ai-message";
import { z } from "zod";

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

const arcFilePartGuardSchema = z.object({
  mediaType: z.string(),
  type: z.literal("file"),
});

export function isArcFilePart(part: ArcMessagePart | unknown): part is ArcFilePart {
  return arcFilePartGuardSchema.safeParse(part).success;
}

export function getArcFileName(part: ArcFilePart): string | undefined {
  return part.filename?.trim() || part.name?.trim() || undefined;
}

export function getArcFileUrl(part: ArcFilePart): string | undefined {
  return part.url?.trim() || part.data?.trim() || undefined;
}
