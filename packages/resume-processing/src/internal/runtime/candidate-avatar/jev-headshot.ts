// TypeSafe Jev System One client for locating a candidate headshot on a resume page image.
// 调用 TypeSafe Jev 在简历首页图片中定位候选人头像；Box 与图片输入属于官方 Danger Zone 能力。

import { z } from "zod";

const JEV_SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
// Box questions require Jev 1.14; jev-preview currently points at jev-1.14.0.
const JEV_HEADSHOT_MODEL = "jev-preview";
const JEV_REQUEST_TIMEOUT_MS = 20_000;
// Asset references are plain-text matched anywhere in the request, so keep them collision-proof.
const PAGE_ASSET_REFERENCE = "resume-first-page-2f6c9d1e";
const PAGE_PART_NAME = "page";

const unitIntervalSchema = z.number().min(0).max(1);
const boxAnswerSchema = z.object({
  box: z.object({
    bottom: unitIntervalSchema,
    left: unitIntervalSchema,
    right: unitIntervalSchema,
    top: unitIntervalSchema,
  }),
  confidence: unitIntervalSchema,
});
const jevHeadshotResponseSchema = z.object({
  answers: z.object({
    has_photo: z.object({ noul: unitIntervalSchema }),
    person: boxAnswerSchema,
    photo: boxAnswerSchema,
  }),
  model: z.string().min(1),
});

export interface HeadshotBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface LocatedBox {
  box: HeadshotBox;
  confidence: number;
}

// person（头部加可见躯干）用来让人在头像里居中；photo 是整张证件照的边界，裁剪不越过它以免截到简历文字。
// `person` (head plus visible torso) centres the avatar; `photo` bounds the crop so it never
// spills into the surrounding resume text.
export interface HeadshotLocation {
  model: string;
  person: LocatedBox;
  photo: LocatedBox;
  photoProbability: number;
}

export function getJevApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.JEV_API_KEY?.trim() || null;
}

export async function locateHeadshotWithJev(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  image: Uint8Array<ArrayBuffer>;
  mediaType: "image/jpeg" | "image/png";
  signal?: AbortSignal;
}): Promise<HeadshotLocation> {
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [
        JSON.stringify({
          assets: { [PAGE_ASSET_REFERENCE]: { part: PAGE_PART_NAME, type: "image" } },
          model: JEV_HEADSHOT_MODEL,
          questions: {
            has_photo: {
              instructions:
                "Does `page` contain an ID-style headshot photo of the candidate (a photograph of a real person's face)?",
              type: "noul",
            },
            person: {
              instructions:
                "the person shown in the candidate's headshot photo in `page`: the head with hair plus whatever part of the upper body and torso is visible, excluding the empty background around them",
              type: "box",
            },
            photo: {
              instructions:
                "the candidate's headshot photo (the whole portrait photograph of a person) in `page`",
              type: "box",
            },
          },
          state: { page: PAGE_ASSET_REFERENCE },
        }),
      ],
      { type: "application/json" },
    ),
  );
  form.append(
    PAGE_PART_NAME,
    new Blob([input.image], { type: input.mediaType }),
    input.mediaType === "image/png" ? "page.png" : "page.jpg",
  );

  const timeout = AbortSignal.timeout(JEV_REQUEST_TIMEOUT_MS);
  const response = await (input.fetchImpl ?? fetch)(JEV_SYSTEM_ONE_URL, {
    body: form,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "TypeSafe-Danger-Zone-Images": "true",
    },
    method: "POST",
    signal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Jev headshot request failed with HTTP ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
  const body: unknown = await response.json();
  const parsed = jevHeadshotResponseSchema.parse(body);
  return {
    model: parsed.model,
    person: parsed.answers.person,
    photo: parsed.answers.photo,
    photoProbability: parsed.answers.has_photo.noul,
  };
}
