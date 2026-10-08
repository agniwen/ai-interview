import { getLocale } from "@/paraglide/runtime";

const CALIBRATION_COPY = {
  en: {
    calibrationEvidence: "Shared evidence",
    calibrationEvidenceBody:
      "Design-system migration across 4 product lines; delivery time reduced by 30%.",
    calibrationReviewers: [
      {
        judgment: "Recommended",
        name: "Misato",
        note: "Project ownership is supported by clear evidence.",
        role: "Recruiter",
      },
      {
        judgment: "Recommended",
        name: "Ritsuko",
        note: "Architecture decisions and rollback criteria are well explained.",
        role: "Technical interviewer",
      },
      {
        judgment: "Pending",
        name: "Shinji",
        note: "Validate the scope of team leadership in the next round.",
        role: "Hiring manager",
      },
    ],
    calibrationSource: "Resume p. 2 · Interview 12:36",
    calibrationTitle: "Asuka · Overall evaluation",
  },
  ja: {
    calibrationEvidence: "共通の根拠",
    calibrationEvidenceBody: "4 つの製品ラインでデザインシステムを移行し、納期を 30% 短縮。",
    calibrationReviewers: [
      {
        judgment: "推薦",
        name: "ミサト",
        note: "プロジェクトでの担当範囲に明確な根拠がある。",
        role: "採用担当",
      },
      {
        judgment: "推薦",
        name: "リツコ",
        note: "設計判断とロールバック基準の説明が具体的。",
        role: "技術面接官",
      },
      {
        judgment: "保留",
        name: "シンジ",
        note: "次の面接でチーム管理の範囲を確認する。",
        role: "採用マネージャー",
      },
    ],
    calibrationSource: "履歴書 2 ページ · 面接 12:36",
    calibrationTitle: "アスカ · 総合評価",
  },
  ko: {
    calibrationEvidence: "공통 근거",
    calibrationEvidenceBody: "4개 제품군의 디자인 시스템을 이전하고 평균 납기를 30% 단축했습니다.",
    calibrationReviewers: [
      {
        judgment: "추천",
        name: "미사토",
        note: "프로젝트 담당 범위에 명확한 근거가 있습니다.",
        role: "채용 담당자",
      },
      {
        judgment: "추천",
        name: "리츠코",
        note: "설계 결정과 롤백 기준을 구체적으로 설명했습니다.",
        role: "기술 면접관",
      },
      {
        judgment: "보류",
        name: "신지",
        note: "다음 면접에서 팀 관리 범위를 확인합니다.",
        role: "채용 관리자",
      },
    ],
    calibrationSource: "이력서 2페이지 · 면접 12:36",
    calibrationTitle: "아스카 · 종합 평가",
  },
  "zh-CN": {
    calibrationEvidence: "共同证据",
    calibrationEvidenceBody: "主导设计系统迁移，覆盖 4 条产品线，平均交付周期缩短 30%。",
    calibrationReviewers: [
      {
        judgment: "推荐",
        name: "葛城美里",
        note: "项目职责清晰，关键成果有直接证据支撑。",
        role: "招聘负责人",
      },
      {
        judgment: "推荐",
        name: "赤木律子",
        note: "架构决策与回滚标准，已经在追问中验证。",
        role: "技术面试官",
      },
      {
        judgment: "待定",
        name: "碇真嗣",
        note: "下一轮重点确认带队规模与管理职责。",
        role: "用人经理",
      },
    ],
    calibrationSource: "简历第 2 页 · 面试 12:36",
    calibrationTitle: "明日香 · 综合评估",
  },
} as const;

export function getHomeCalibrationCopy() {
  return CALIBRATION_COPY[getLocale()];
}
