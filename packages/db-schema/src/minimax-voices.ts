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
    description: "普通话 · MiniMax 中文 preset",
    gender: "male",
    id: "male-qn-qingse",
    label: "青涩青年",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "male",
    id: "male-qn-jingying",
    label: "精英青年",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "male",
    id: "male-qn-badao",
    label: "霸道青年",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "male",
    id: "male-qn-daxuesheng",
    label: "青年大学生",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "female",
    id: "female-shaonv",
    label: "少女",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "female",
    id: "female-yujie",
    label: "御姐",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "female",
    id: "female-chengshu",
    label: "成熟女性",
  },
  {
    description: "普通话 · MiniMax 中文 preset",
    gender: "female",
    id: "female-tianmei",
    label: "甜美女性",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "male",
    id: "male-qn-qingse-jingpin",
    label: "青涩青年 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "male",
    id: "male-qn-jingying-jingpin",
    label: "精英青年 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "male",
    id: "male-qn-badao-jingpin",
    label: "霸道青年 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "male",
    id: "male-qn-daxuesheng-jingpin",
    label: "青年大学生 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "female",
    id: "female-shaonv-jingpin",
    label: "少女 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "female",
    id: "female-yujie-jingpin",
    label: "御姐 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "female",
    id: "female-chengshu-jingpin",
    label: "成熟女性 beta",
  },
  {
    description: "普通话 · MiniMax 中文 preset · beta",
    gender: "female",
    id: "female-tianmei-jingpin",
    label: "甜美女性 beta",
  },
  {
    description: "普通话 · 童声",
    gender: "male",
    id: "clever_boy",
    label: "聪明男童",
  },
  {
    description: "普通话 · 童声",
    gender: "male",
    id: "cute_boy",
    label: "可爱男童",
  },
  {
    description: "普通话 · 童声",
    gender: "female",
    id: "lovely_girl",
    label: "萌萌女童",
  },
  {
    description: "普通话 · 卡通角色",
    gender: "female",
    id: "cartoon_pig",
    label: "卡通猪小琪",
  },
  {
    description: "普通话 · 角色音",
    gender: "male",
    id: "bingjiao_didi",
    label: "病娇弟弟",
  },
  {
    description: "普通话 · 角色音",
    gender: "male",
    id: "junlang_nanyou",
    label: "俊朗男友",
  },
  {
    description: "普通话 · 角色音",
    gender: "male",
    id: "chunzhen_xuedi",
    label: "纯真学弟",
  },
  {
    description: "普通话 · 角色音",
    gender: "male",
    id: "lengdan_xiongzhang",
    label: "冷淡学长",
  },
  {
    description: "普通话 · 角色音",
    gender: "male",
    id: "badao_shaoye",
    label: "霸道少爷",
  },
  {
    description: "普通话 · 角色音",
    gender: "female",
    id: "tianxin_xiaoling",
    label: "甜心小玲",
  },
  {
    description: "普通话 · 角色音",
    gender: "female",
    id: "qiaopi_mengmei",
    label: "俏皮萌妹",
  },
  {
    description: "普通话 · 角色音",
    gender: "female",
    id: "wumei_yujie",
    label: "妩媚御姐",
  },
  {
    description: "普通话 · 角色音",
    gender: "female",
    id: "diadia_xuemei",
    label: "嗲嗲学妹",
  },
  {
    description: "普通话 · 角色音",
    gender: "female",
    id: "danya_xuejie",
    label: "淡雅学姐",
  },
  {
    description: "标准普通话 · 沉稳可靠的中年男性高管声音",
    gender: "male",
    id: "Chinese (Mandarin)_Reliable_Executive",
    label: "沉稳高管",
  },
  {
    description: "标准普通话 · 专业、播音腔的中年女性新闻主播",
    gender: "female",
    id: "Chinese (Mandarin)_News_Anchor",
    label: "新闻女声",
  },
  {
    description: "标准普通话 · 妩媚成熟的青年御姐声音",
    gender: "female",
    id: "Chinese (Mandarin)_Mature_Woman",
    label: "傲娇御姐",
  },
  {
    description: "标准普通话 · 潇洒不羁的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Unrestrained_Young_Man",
    label: "不羁青年",
  },
  {
    description: "标准普通话 · 嚣张自信的青年女性声音",
    gender: "female",
    id: "Arrogant_Miss",
    label: "嚣张小姐",
  },
  {
    description: "标准普通话 · 电子化、机器人般的青年男性声音",
    gender: "male",
    id: "Robot_Armor",
    label: "机械战甲",
  },
  {
    description: "标准普通话 · 温和善良的中年大婶声音",
    gender: "female",
    id: "Chinese (Mandarin)_Kind-hearted_Antie",
    label: "热心大婶",
  },
  {
    description: "港式普通话 · 礼貌清晰的中年女性空乘员声音",
    gender: "female",
    id: "Chinese (Mandarin)_HK_Flight_Attendant",
    label: "港普空姐",
  },
  {
    description: "北方口音中文 · 爽朗幽默的老年男性大爷声音",
    gender: "male",
    id: "Chinese (Mandarin)_Humorous_Elder",
    label: "搞笑大爷",
  },
  {
    description: "标准普通话 · 温润磁性的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Gentleman",
    label: "温润男声",
  },
  {
    description: "标准普通话 · 温暖清脆的青年女性闺蜜声音",
    gender: "female",
    id: "Chinese (Mandarin)_Warm_Bestie",
    label: "温暖闺蜜",
  },
  {
    description: "标准普通话 · 磁性、清晰、权威的中年男性播报员声音",
    gender: "male",
    id: "Chinese (Mandarin)_Male_Announcer",
    label: "播报男声",
  },
  {
    description: "标准普通话 · 温柔甜美的青年女性声音",
    gender: "female",
    id: "Chinese (Mandarin)_Sweet_Lady",
    label: "甜美女声",
  },
  {
    description: "南方口音中文 · 质朴的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Southern_Young_Man",
    label: "南方小哥",
  },
  {
    description: "标准普通话 · 富有阅历、声音抒情的中年姐姐声音",
    gender: "female",
    id: "Chinese (Mandarin)_Wise_Women",
    label: "阅历姐姐",
  },
  {
    description: "标准普通话 · 温柔的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Gentle_Youth",
    label: "温润青年",
  },
  {
    description: "标准普通话 · 温柔温暖的少年女声",
    gender: "female",
    id: "Chinese (Mandarin)_Warm_Girl",
    label: "温暖少女",
  },
  {
    description: "标准普通话 · 慈祥和蔼的老年女性奶奶声音",
    gender: "female",
    id: "Chinese (Mandarin)_Kind-hearted_Elder",
    label: "花甲奶奶",
  },
  {
    description: "普通话 · 呆萌可爱的少年男声，适合憨厚角色",
    gender: "male",
    id: "Chinese (Mandarin)_Cute_Spirit",
    label: "憨憨萌兽",
  },
  {
    description: "标准普通话 · 富有诗意的青年男性电台主播声音",
    gender: "male",
    id: "Chinese (Mandarin)_Radio_Host",
    label: "电台男主播",
  },
  {
    description: "标准普通话 · 磁性抒情的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Lyrical_Voice",
    label: "抒情男声",
  },
  {
    description: "标准普通话 · 认真率真的少年弟弟声音",
    gender: "male",
    id: "Chinese (Mandarin)_Straightforward_Boy",
    label: "率真弟弟",
  },
  {
    description: "标准普通话 · 真诚、富有鼓励性的青年男性声音",
    gender: "male",
    id: "Chinese (Mandarin)_Sincere_Adult",
    label: "真诚青年",
  },
  {
    description: "标准普通话 · 温暖温柔的青年学姐声音",
    gender: "female",
    id: "Chinese (Mandarin)_Gentle_Senior",
    label: "温柔学姐",
  },
  {
    description: "标准普通话 · 嘴硬心软、不羁的青年竹马声音",
    gender: "male",
    id: "Chinese (Mandarin)_Stubborn_Friend",
    label: "嘴硬竹马",
  },
  {
    description: "标准普通话 · 温暖清脆的少女声音",
    gender: "female",
    id: "Chinese (Mandarin)_Crisp_Girl",
    label: "清脆少女",
  },
  {
    description: "标准普通话 · 认真清澈的邻家少年弟弟声音",
    gender: "male",
    id: "Chinese (Mandarin)_Pure-hearted_Boy",
    label: "清澈邻家弟弟",
  },
  {
    description: "南方口音中文 · 温暖柔软的青年女性声音",
    gender: "female",
    id: "Chinese (Mandarin)_Soft_Girl",
    label: "软软女孩",
  },
  {
    description: "粤语 · 中性、专业的青年女性主持人声音",
    gender: "female",
    id: "Cantonese_ProfessionalHost（F)",
    label: "粤语 · 专业女主持",
  },
  {
    description: "粤语 · 平静温柔的青年女性声音",
    gender: "female",
    id: "Cantonese_GentleLady",
    label: "粤语 · 温柔女声",
  },
  {
    description: "粤语 · 中性、专业的青年男性主持人声音",
    gender: "male",
    id: "Cantonese_ProfessionalHost（M)",
    label: "粤语 · 专业男主持",
  },
  {
    description: "粤语 · 活泼深情的青年男性声音",
    gender: "male",
    id: "Cantonese_PlayfulMan",
    label: "粤语 · 活泼男声",
  },
  {
    description: "粤语 · 柔和可爱的青年女性声音",
    gender: "female",
    id: "Cantonese_CuteGirl",
    label: "粤语 · 可爱女孩",
  },
  {
    description: "粤语 · 亲切善良的青年女性声音",
    gender: "female",
    id: "Cantonese_KindWoman",
    label: "粤语 · 善良女声",
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
