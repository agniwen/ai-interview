import { z } from "zod";

/** 招聘台展示分组，不替代 recruiting_record 的实际流程节点。 */
export const recruitingBoardViewValues = [
  "screening:all",
  "screening:pending",
  "screening:fail",
  "screening:pass",
  "interview:all",
  "interview:ai",
  "interview:second",
  "interview:final",
  "offer:all",
  "offer:income",
  "offer:negotiating",
  "offer:send",
  "offer:background",
  "onboarding:all",
  "onboarding:pending",
  "onboarding:withdrawn",
  "onboarding:hired",
  "closed:all",
  "closed:rejected",
  "closed:withdrawn",
  "closed:hired",
  "closed:archived",
] as const;
export const recruitingBoardViewSchema = z.enum(recruitingBoardViewValues);
export type RecruitingBoardView = z.infer<typeof recruitingBoardViewSchema>;
interface BoardGroup {
  id: string;
  label: string;
  tabs: { value: RecruitingBoardView; label: string }[];
}
export const recruitingBoardGroups = [
  {
    id: "screening",
    label: "简历筛选",
    tabs: [
      { label: "全部", value: "screening:all" },
      { label: "未处理", value: "screening:pending" },
      { label: "淘汰", value: "screening:fail" },
      { label: "合格", value: "screening:pass" },
    ],
  },
  {
    id: "interview",
    label: "面试",
    tabs: [
      { label: "全部", value: "interview:all" },
      { label: "AI 初面", value: "interview:ai" },
      { label: "复试", value: "interview:second" },
      { label: "终试", value: "interview:final" },
    ],
  },
  {
    id: "offer",
    label: "Offer协商",
    tabs: [
      { label: "全部", value: "offer:all" },
      { label: "流水提供", value: "offer:income" },
      { label: "谈薪", value: "offer:negotiating" },
      { label: "发 Offer", value: "offer:send" },
      { label: "背调", value: "offer:background" },
    ],
  },
  {
    id: "onboarding",
    label: "入职办理",
    tabs: [
      { label: "全部", value: "onboarding:all" },
      { label: "待入职", value: "onboarding:pending" },
      { label: "放弃", value: "onboarding:withdrawn" },
      { label: "已入职", value: "onboarding:hired" },
    ],
  },
  {
    id: "closed",
    label: "已结束",
    tabs: [
      { label: "全部", value: "closed:all" },
      { label: "淘汰", value: "closed:rejected" },
      { label: "放弃", value: "closed:withdrawn" },
      { label: "已入职", value: "closed:hired" },
      { label: "已归档", value: "closed:archived" },
    ],
  },
] satisfies BoardGroup[];

/** 原节点 URL 继续定位到对应子标签；无筛选时默认简历筛选。 */
export function resolveRecruitingBoardView(value: string | undefined): RecruitingBoardView {
  const parsed = recruitingBoardViewSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  switch (value) {
    case "ai_interview": {
      return "interview:ai";
    }
    case "second_interview": {
      return "interview:second";
    }
    case "final_interview": {
      return "interview:final";
    }
    case "income_proof": {
      return "offer:income";
    }
    case "offer": {
      return "offer:all";
    }
    case "background_check": {
      return "offer:background";
    }
    case "onboarding": {
      return "onboarding:all";
    }
    case "closed": {
      return "closed:all";
    }
    default: {
      return "screening:all";
    }
  }
}

export function getRecruitingBoardGroup(view: RecruitingBoardView) {
  return (
    recruitingBoardGroups.find((group) => group.tabs.some((tab) => tab.value === view)) ??
    recruitingBoardGroups[0]
  );
}

/** 空状态等展示文案复用标签配置，避免把视图标识误当成流程节点枚举。 */
export function getRecruitingBoardViewLabel(value: string | undefined): string {
  const view = resolveRecruitingBoardView(value);
  const group = getRecruitingBoardGroup(view);
  const tab = group.tabs.find((entry) => entry.value === view);
  return view.endsWith(":all") || !tab ? group.label : `${group.label} · ${tab.label}`;
}
