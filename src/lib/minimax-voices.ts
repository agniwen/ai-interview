import { z } from "zod";

export interface MinimaxVoicePreset {
  id: string;
  label: string;
  gender: "male" | "female";
  description: string;
}

export const MINIMAX_VOICES = [
  {
    description: "男声 · 电话场景 · 适合正式面试官",
    gender: "male",
    id: "voice_agent_Male_Phone_1",
    label: "男声 · 电话 1（默认）",
  },
  {
    description: "男声 · 电话场景 · 更沉稳",
    gender: "male",
    id: "voice_agent_Male_Phone_2",
    label: "男声 · 电话 2",
  },
  {
    description: "女声 · 电话场景 · 明亮亲和",
    gender: "female",
    id: "voice_agent_Female_Phone_1",
    label: "女声 · 电话 1",
  },
  {
    description: "男声 · 沉稳磁性 · 适合高级岗位",
    gender: "male",
    id: "male-qn-qingse",
    label: "男声 · 青涩",
  },
  {
    description: "男声 · 精英气质 · 适合技术面",
    gender: "male",
    id: "male-qn-jingying",
    label: "男声 · 精英",
  },
  {
    description: "女声 · 少女音 · 轻快活泼",
    gender: "female",
    id: "female-shaonv",
    label: "女声 · 少女",
  },
  {
    description: "女声 · 御姐音 · 成熟稳重",
    gender: "female",
    id: "female-yujie",
    label: "女声 · 御姐",
  },
] as const satisfies readonly MinimaxVoicePreset[];

export type MinimaxVoiceId = (typeof MINIMAX_VOICES)[number]["id"];

export const MINIMAX_VOICE_IDS = MINIMAX_VOICES.map((voice) => voice.id) as unknown as readonly [
  MinimaxVoiceId,
  ...MinimaxVoiceId[],
];

export const minimaxVoiceSchema = z.enum(MINIMAX_VOICE_IDS);

export const DEFAULT_MINIMAX_VOICE_ID: MinimaxVoiceId = "voice_agent_Male_Phone_1";

export function getMinimaxVoiceMeta(id: string): MinimaxVoicePreset | undefined {
  return MINIMAX_VOICES.find((voice) => voice.id === id);
}
