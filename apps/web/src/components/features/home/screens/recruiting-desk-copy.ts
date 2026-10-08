import { getLocale } from "@/paraglide/runtime";

const DESK_COPY = {
  en: {
    addFilter: "Add filter",
    month: "This month",
    participants: "Contributors",
    periodAdded: "Added this period",
    pipelineTitle: "Recruiting pipeline",
    rankingDescription: "By member who added candidates",
    rankingTitle: "Uploader ranking",
    stages: "Recruiting stages",
    subprocesses: "All subprocesses",
    today: "Today",
    week: "This week",
    yesterday: "Yesterday",
  },
  ja: {
    addFilter: "条件を追加",
    month: "今月",
    participants: "参加メンバー",
    periodAdded: "期間内の登録",
    pipelineTitle: "採用フロー分布",
    rankingDescription: "候補者を登録したメンバー別",
    rankingTitle: "登録ランキング",
    stages: "採用段階",
    subprocesses: "すべてのサブフロー",
    today: "今日",
    week: "今週",
    yesterday: "昨日",
  },
  ko: {
    addFilter: "필터 추가",
    month: "이번 달",
    participants: "참여 구성원",
    periodAdded: "기간 내 등록",
    pipelineTitle: "채용 절차 분포",
    rankingDescription: "후보자를 등록한 구성원별",
    rankingTitle: "등록 순위",
    stages: "채용 단계",
    subprocesses: "전체 하위 절차",
    today: "오늘",
    week: "이번 주",
    yesterday: "어제",
  },
  "zh-CN": {
    addFilter: "添加筛选",
    month: "本月",
    participants: "参与成员",
    periodAdded: "周期入库",
    pipelineTitle: "招聘流程分布",
    rankingDescription: "按候选人入库成员统计",
    rankingTitle: "入库排行榜",
    stages: "招聘阶段",
    subprocesses: "全部子流程",
    today: "今日",
    week: "本周",
    yesterday: "昨日",
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
