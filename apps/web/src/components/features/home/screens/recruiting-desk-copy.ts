import { getLocale } from "@/paraglide/runtime";

const DESK_COPY = {
  en: {
    addFilter: "Add filter",
    pipelineTitle: "Recruiting pipeline",
    stages: "Recruiting stages",
    subprocesses: "All subprocesses",
  },
  ja: {
    addFilter: "条件を追加",
    pipelineTitle: "採用フロー分布",
    stages: "採用段階",
    subprocesses: "すべてのサブフロー",
  },
  ko: {
    addFilter: "필터 추가",
    pipelineTitle: "채용 절차 분포",
    stages: "채용 단계",
    subprocesses: "전체 하위 절차",
  },
  "zh-CN": {
    addFilter: "添加筛选",
    pipelineTitle: "招聘流程分布",
    stages: "招聘阶段",
    subprocesses: "全部子流程",
  },
} as const;

const BOARD_LABELS = {
  en: {
    "AI 初面": "AI screening",
    Offer协商: "Offer negotiation",
    入职办理: "Onboarding",
    全部: "All",
    "发 Offer": "Send offer",
    合格: "Qualified",
    复试: "Second interview",
    已入职: "Joined",
    已归档: "Archived",
    已结束: "Closed",
    待入职: "Awaiting start",
    放弃: "Withdrawn",
    未处理: "Pending",
    流水提供: "Income records",
    淘汰: "Rejected",
    简历筛选: "Screening",
    终试: "Final interview",
    背调: "Background check",
    谈薪: "Salary negotiation",
    面试: "Interviews",
  },
  ja: {
    "AI 初面": "AI 初回面接",
    Offer协商: "オファー交渉",
    入职办理: "入社手続き",
    全部: "すべて",
    "发 Offer": "オファー送付",
    合格: "合格",
    复试: "二次面接",
    已入职: "入社済み",
    已归档: "アーカイブ済み",
    已结束: "終了",
    待入职: "入社待ち",
    放弃: "辞退",
    未处理: "未処理",
    流水提供: "給与明細",
    淘汰: "不合格",
    简历筛选: "書類選考",
    终试: "最終面接",
    背调: "身元調査",
    谈薪: "給与交渉",
    面试: "面接",
  },
  ko: {
    "AI 初面": "AI 첫 면접",
    Offer协商: "오퍼 협상",
    入职办理: "입사 절차",
    全部: "전체",
    "发 Offer": "오퍼 발송",
    合格: "합격",
    复试: "2차 면접",
    已入职: "입사 완료",
    已归档: "보관됨",
    已结束: "종료",
    待入职: "입사 대기",
    放弃: "포기",
    未处理: "미처리",
    流水提供: "급여 내역",
    淘汰: "탈락",
    简历筛选: "이력서 심사",
    终试: "최종 면접",
    背调: "평판 조회",
    谈薪: "연봉 협상",
    面试: "면접",
  },
};

export function getHomeDeskCopy() {
  return DESK_COPY[getLocale()];
}

export function localizeBoardLabel(label: string) {
  const locale = getLocale();
  if (locale === "zh-CN") {
    return label;
  }
  const translations = new Map(Object.entries(BOARD_LABELS[locale]));
  return label
    .split(" · ")
    .map((part) => translations.get(part) ?? part)
    .join(" · ");
}
