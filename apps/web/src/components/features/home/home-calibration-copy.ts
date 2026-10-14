import { getLocale } from "@/paraglide/runtime";

const CALIBRATION_COPY = {
  en: {
    calibrationEvidence: "Shared evidence",
    calibrationEvidenceBody:
      "Synchronized twin-unit kill on the Seventh Angel with Unit-01 in 62 seconds.",
    calibrationReviewers: [
      {
        judgment: "Recommended",
        name: "Misato",
        note: "Her combat role is backed by clear sortie evidence.",
        role: "Recruiter",
      },
      {
        judgment: "Recommended",
        name: "Ritsuko",
        note: "Sync data and retreat criteria were verified in follow-ups.",
        role: "Technical interviewer",
      },
      {
        judgment: "Pending",
        name: "Gendo",
        note: "Confirm formation teamwork and chain of command next round.",
        role: "Hiring manager",
      },
    ],
    calibrationSource: "Resume p. 2 · Interview 12:36",
    calibrationTitle: "Asuka · Overall evaluation",
  },
  ja: {
    calibrationEvidence: "共通の根拠",
    calibrationEvidenceBody: "初号機と同期し、第7使徒を 62 秒で二機同時殲滅。",
    calibrationReviewers: [
      {
        judgment: "推薦",
        name: "ミサト",
        note: "作戦での役割に明確な出撃根拠がある。",
        role: "採用担当",
      },
      {
        judgment: "推薦",
        name: "リツコ",
        note: "シンクロデータと撤退基準を追加質問で確認済み。",
        role: "技術面接官",
      },
      {
        judgment: "保留",
        name: "ゲンドウ",
        note: "次の面接で編隊連携と指揮系統への順応を確認する。",
        role: "採用マネージャー",
      },
    ],
    calibrationSource: "履歴書 2 ページ · 面接 12:36",
    calibrationTitle: "アスカ · 総合評価",
  },
  ko: {
    calibrationEvidence: "공통 근거",
    calibrationEvidenceBody: "초호기와 동기화해 제7사도를 62초 만에 2기 동시 섬멸했습니다.",
    calibrationReviewers: [
      {
        judgment: "추천",
        name: "미사토",
        note: "작전에서 맡은 역할에 명확한 출격 근거가 있습니다.",
        role: "채용 담당자",
      },
      {
        judgment: "추천",
        name: "리츠코",
        note: "싱크로 데이터와 철수 기준을 추가 질문으로 확인했습니다.",
        role: "기술 면접관",
      },
      {
        judgment: "보류",
        name: "겐도",
        note: "다음 면접에서 편대 협동과 지휘 체계 적응을 확인합니다.",
        role: "채용 관리자",
      },
    ],
    calibrationSource: "이력서 2페이지 · 면접 12:36",
    calibrationTitle: "아스카 · 종합 평가",
  },
  "zh-CN": {
    calibrationEvidence: "共同证据",
    calibrationEvidenceBody: "与初号机同步作战，62 秒内完成第七使徒双机歼灭。",
    calibrationReviewers: [
      {
        judgment: "推荐",
        name: "葛城美里",
        note: "作战职责清晰，关键战果有直接出击证据支撑。",
        role: "招聘负责人",
      },
      {
        judgment: "推荐",
        name: "赤木律子",
        note: "同步数据与撤离标准，已经在追问中验证。",
        role: "技术面试官",
      },
      {
        judgment: "待定",
        name: "碇源堂",
        note: "下一轮重点确认编队配合与服从指挥。",
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
