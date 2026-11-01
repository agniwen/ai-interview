import { getLocale } from "@/paraglide/runtime";

const CALIBRATION_COPY = {
  en: {
    calibrationEvidence: "Shared evidence",
    calibrationEvidenceBody:
      "Led the “City Summer Challenge”: 12,000 joined one run and new users hit 41% 7-day retention.",
    calibrationReviewers: [
      {
        judgment: "Recommended",
        name: "Misato",
        note: "Her campaign role is backed by clear project retros.",
        role: "Recruiter",
      },
      {
        judgment: "Recommended",
        name: "Ritsuko",
        note: "Retention definition and campaign cost were verified in follow-ups.",
        role: "Business interviewer",
      },
      {
        judgment: "Pending",
        name: "Gendo",
        note: "Confirm how she works across teams next round.",
        role: "Hiring manager",
      },
    ],
    calibrationSource: "Resume p. 2 · Interview 12:36",
    calibrationTitle: "Asuka · Overall evaluation",
  },
  ja: {
    calibrationEvidence: "共通の根拠",
    calibrationEvidenceBody:
      "「シティサマーチャレンジ」を主導し、1 回で 1.2 万人が参加、新規の 7 日定着率 41%。",
    calibrationReviewers: [
      {
        judgment: "推薦",
        name: "ミサト",
        note: "施策での役割が明確で、主要データはプロジェクト振り返りで裏付けられている。",
        role: "採用担当",
      },
      {
        judgment: "推薦",
        name: "リツコ",
        note: "定着率の定義と施策コストを追加質問で確認済み。",
        role: "業務面接官",
      },
      {
        judgment: "保留",
        name: "ゲンドウ",
        note: "次の面接で部門横断の協働スタイルを確認する。",
        role: "採用マネージャー",
      },
    ],
    calibrationSource: "履歴書 2 ページ · 面接 12:36",
    calibrationTitle: "アスカ · 総合評価",
  },
  ko: {
    calibrationEvidence: "공통 근거",
    calibrationEvidenceBody:
      "‘시티 서머 챌린지’를 주도해 한 번에 1.2만 명이 참여, 신규 7일 유지율 41%.",
    calibrationReviewers: [
      {
        judgment: "추천",
        name: "미사토",
        note: "캠페인에서 맡은 역할이 명확하고 핵심 데이터가 프로젝트 회고로 뒷받침됩니다.",
        role: "채용 담당자",
      },
      {
        judgment: "추천",
        name: "리츠코",
        note: "유지율 기준과 캠페인 비용을 추가 질문으로 확인했습니다.",
        role: "업무 면접관",
      },
      {
        judgment: "보류",
        name: "겐도",
        note: "다음 면접에서 부서 간 협업 방식을 확인합니다.",
        role: "채용 관리자",
      },
    ],
    calibrationSource: "이력서 2페이지 · 면접 12:36",
    calibrationTitle: "아스카 · 종합 평가",
  },
  "zh-CN": {
    calibrationEvidence: "共同证据",
    calibrationEvidenceBody: "主导“城市夏日挑战”，单场 1.2 万人参与，新用户 7 日留存 41%。",
    calibrationReviewers: [
      {
        judgment: "推荐",
        name: "葛城美里",
        note: "活动职责清晰，关键数据有项目复盘支撑。",
        role: "招聘负责人",
      },
      {
        judgment: "推荐",
        name: "赤木律子",
        note: "留存口径与活动成本，已经在追问中验证。",
        role: "业务面试官",
      },
      {
        judgment: "待定",
        name: "碇源堂",
        note: "下一轮重点确认跨部门协作方式。",
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
