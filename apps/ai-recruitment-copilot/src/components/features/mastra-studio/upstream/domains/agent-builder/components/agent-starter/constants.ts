import { GraduationCap, MessageCircleQuestion, MessagesSquare, Wrench } from "lucide-react";

export const FALLBACK_MODEL = { name: "gemini-2.5-flash", provider: "google" } as const;

export const EXAMPLES = [
  {
    icon: MessagesSquare,
    prompt:
      "构建一个处理客户支持邮件的智能体：判断紧急程度、分配给合适的团队，并起草礼貌的首次回复，询问缺失信息。",
    title: "支持工单分流",
  },
  {
    icon: MessageCircleQuestion,
    prompt:
      "构建一个运行 Slack 异步站会的智能体：每天早上提醒团队成员，收集已完成、计划完成和阻塞事项，然后在 #standup 中发布简洁摘要。",
    title: "站会机器人",
  },
  {
    icon: Wrench,
    prompt:
      "构建一个审查 GitHub TypeScript 拉取请求的智能体：查找类型安全问题、缺失测试和不一致的代码模式，并给出具体的行内评审建议。",
    title: "PR 评审助手",
  },
  {
    icon: GraduationCap,
    prompt:
      "构建一个帮助新工程师熟悉代码库的智能体：讲解架构、指向正确文档，并用清晰语言和代码示例回答问题。",
    title: "入职辅导助手",
  },
];
