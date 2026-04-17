import type { FileUIPart } from "ai";

export const TUTORIAL_MOCK_CONVERSATIONS = [
  {
    id: "tutorial-1",
    isTitleGenerating: false,
    title: "前端开发岗 — 张三简历分析",
    updatedAt: Date.now() - 1_800_000,
  },
  {
    id: "tutorial-2",
    isTitleGenerating: false,
    title: "后端工程师 — 李四匹配度评估",
    updatedAt: Date.now() - 7_200_000,
  },
  {
    id: "tutorial-3",
    isTitleGenerating: false,
    title: "产品经理 — 王五综合筛选",
    updatedAt: Date.now() - 86_400_000,
  },
];

export const TUTORIAL_MOCK_INPUT_TEXT = "请分析这份简历的核心竞争力，并给出岗位匹配度评分。";

export const TUTORIAL_MOCK_ATTACHMENTS: (FileUIPart & { id: string })[] = [
  {
    filename: "张三_前端开发工程师_简历.pdf",
    id: "tutorial-file-1",
    mediaType: "application/pdf",
    type: "file",
    url: "data:application/pdf;base64,",
  },
  {
    filename: "李四_后端开发_简历.pdf",
    id: "tutorial-file-2",
    mediaType: "application/pdf",
    type: "file",
    url: "data:application/pdf;base64,",
  },
];
