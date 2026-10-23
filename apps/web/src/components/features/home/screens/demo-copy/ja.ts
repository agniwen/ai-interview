import type { DemoScreenCopy } from "./zh-cn";

export const jaDemoScreenCopy: DemoScreenCopy = {
  agentState: {
    listening: "回答をどうぞ...",
    speaking: "面接官が話しています",
  },
  aiInterview: {
    aiInterviewer: "AI 面接官",
    candidateInfo: "候補者情報",
    completed: "完了",
    contributionBody:
      "企画テーマ・ルール設計・振り返りを担当し、3 週間で新規 4,200 人、来店利用率 27% を達成。",
    contributionTitle: "「週末来店チェックイン」での個人の貢献",
    conversationLabel: "対話",
    conversationQuestions: "対話質問",
    conversationValue: "候補者の回答 12 回",
    copyLink: "面接リンクをコピー",
    endTime: "終了時刻",
    formAnswers: [
      {
        label: "経験年数",
        value: "3 年",
      },
      {
        label: "希望給与",
        value: "月 ¥18,000–20,000",
      },
      {
        label: "入社可能時期",
        value: "オファー確定後 2 週間以内",
      },
    ],
    formQuestions: "フォーム質問",
    hideTranscript: "対話記録を閉じる",
    itemCount: (count: number) => `${count} 件`,
    recommendBadge: "推奨",
    resultMarkdown:
      "**対面面接へ進めることを推奨。** シンジは「週末来店チェックイン」の企画・実行・振り返りと、コミュニティでの炎上対応の流れを明確に説明できました。個人の貢献が具体的で、月間アクティブ率は 18% から 36% に向上し、3 か月連続のデータで裏付けられています。対面面接では部門横断の連携と予算管理を重点的に確認します。",
    resultTitle: "面接結果",
    roundButton: "第 1 回 · AI 初回面接 · 10/08 11:00",
    scoreLabel: "スコア",
    showTranscript: "対話記録を見る",
    startTime: "開始時刻",
    suggestionLabel: "提案",
    transcriptTitle: "面接の対話",
    viewQuestions: "推奨質問を見る",
  },
  autoplayCaption: "採用フロー自動デモ",
  basicInfo: {
    creator: "作成者",
    email: "メール",
    name: "氏名",
    phone: "電話",
    relatedJob: "関連求人",
    resumeAttachment: "PDF 履歴書",
    resumeFile: "履歴書ファイル",
    targetRole: "希望職種",
  },
  conversation: [
    {
      answer:
        "拾光ライフで 40 以上の都市別ユーザーグループを担当し、新規参加 SOP と KOC の段階別インセンティブを整備しました。「週末来店チェックイン」は企画から振り返りまで一人で担当し、3 週間で新規 4,200 人、来店利用率 27% でした。",
      question: "担当したコミュニティ成長施策と、その中でのあなたの担当部分を教えてください。",
    },
    {
      answer:
        "まずグループ内で統一した回答と対応期限を示し、感情の拡散を防ぎます。同時にサポートと事業部門で臨時の対応グループを作り、30 分以内に対応策を出します。後で典型的な問題を FAQ とお知らせにまとめ、毎月クレーム率を振り返ります。",
      question: "グループで苦情やネガティブな反応が集中したとき、どう対応しますか？",
    },
    {
      answer:
        "定義は「その月にグループで発言またはイベントに参加したメンバーの割合」で、bot と社員アカウントは除外しています。施策を行っていない対照グループと比較してセール期の自然増を除き、3 か月連続で 33% 以上を維持しました。",
      question:
        "月間アクティブ率が 18% から 36% に上がりました。データの有効性をどう確認しましたか？",
    },
  ],
  desk: {
    clearFilters: "条件をクリア",
    close: "閉じる",
    countLabel: (count: number) => `${count} 人`,
    dateGroups: { earlier: "10月4日", today: "今日", yesterday: "昨日" },
    empty: "条件に合う候補者はいません",
    highlyRecommended: "強く推奨",
    refreshed: "候補者一覧を更新しました",
    resumeCount: (count: number) => `履歴書 ${count} 件`,
  },
  deskRecords: {
    "00001": {
      detail: "最終面接 · 評価待ち",
      education: [
        {
          period: "2018–2022",
          primary: "南京大学",
          secondary: "中国語文学 · 学士",
        },
      ],
      focus: [
        {
          content: "コンテンツ運営 3 年、長文記事と短尺動画の企画が得意で安定して制作できる。",
          kind: "matching" as const,
          point: "コンテンツ企画",
        },
        {
          content: "閲覧・完視聴・転換データを毎週振り返り、企画に反映している。",
          kind: "matching" as const,
          point: "データ振り返り",
        },
        {
          content: "志望動機の記述が少なく、最終面接で協働意欲を確認したい。",
          kind: "risk" as const,
          point: "主体的な発信",
        },
      ],
      job: "雲帆テック / コンテンツ運営",
      name: "綾波レイ",
      stage: "対面面接",
      summary:
        "コンテンツ運営 3 年、長文記事と短尺動画の企画が得意。実行は安定、志望動機の記述は少なめ。",
      verdict: "推奨",
      work: [
        {
          period: "2022–現在",
          primary: "知行アカデミー",
          secondary: "コンテンツ運営",
        },
        {
          period: "2021–2022",
          primary: "青禾出版 新メディア部",
          secondary: "編集インターン",
        },
      ],
    },
    "00002": {
      detail: "二次面接 · 設定済み",
      education: [
        {
          period: "2016–2020",
          primary: "復旦大学",
          secondary: "マーケティング · 学士",
        },
      ],
      focus: [
        {
          content: "1 回で 1.2 万人が参加したオンラインチャレンジを主導。",
          kind: "matching" as const,
          point: "イベント企画",
        },
        {
          content: "海外の中国語ユーザーコミュニティを運営し、複数タイムゾーンに慣れている。",
          kind: "matching" as const,
          point: "海外コミュニティ",
        },
        {
          content: "単独で進めがちなため、部門横断の協働スタイルを二次面接で確認したい。",
          kind: "risk" as const,
          point: "協働",
        },
      ],
      job: "雲帆テック / シニアコミュニティ運営",
      name: "惣流・アスカ・ラングレー",
      stage: "対面面接",
      summary:
        "コミュニティ・イベント運営 5 年。ゼロからのコミュニティ立ち上げが得意で、企画力が高い。",
      verdict: "推奨",
      work: [
        {
          period: "2022–現在",
          primary: "海程セレクト",
          secondary: "コミュニティ運営リーダー",
        },
        {
          period: "2020–2022",
          primary: "啓明エデュケーション",
          secondary: "イベント運営",
        },
      ],
    },
    "00004": {
      detail: "未処理",
      education: [
        {
          period: "2020–2024",
          primary: "広州体育学院",
          secondary: "スポーツ経済・マネジメント · 学士",
        },
      ],
      focus: [
        {
          content: "学内サークルでのイベント運営経験が豊富で、ユーザーとの対話が得意。",
          kind: "matching" as const,
          point: "ユーザーとの対話",
        },
        {
          content: "オンライン運営の一貫したプロジェクト経験がなく、データ分析力も補う必要がある。",
          kind: "risk" as const,
          point: "運営経験",
        },
        {
          content: "新卒のため、運営職の理解度を確認したい。",
          kind: "risk" as const,
          point: "職務理解",
        },
      ],
      job: "雲帆テック / ユーザー運営",
      name: "鈴原トウジ",
      stage: "書類選考",
      summary: "新卒。学内イベントの運営経験は豊富だが、オンライン運営の一貫した実績はまだない。",
      verdict: "保留",
      work: [
        {
          period: "2023–2024",
          primary: "疾風スポーツ",
          secondary: "店舗イベントインターン",
        },
        {
          period: "2021–2024",
          primary: "大学バスケットボール部",
          secondary: "部長",
        },
      ],
    },
    "00005": {
      detail: "合格",
      education: [
        {
          period: "2015–2019",
          primary: "エディンバラ大学",
          secondary: "心理学 · 学士",
        },
      ],
      focus: [
        {
          content: "ユーザーリサーチと心理学の素養があり、動機を素早く読み取れる。",
          kind: "matching" as const,
          point: "ユーザー理解",
        },
        {
          content: "直近 2 年はフリーランスのため、職歴を重点的に確認したい。",
          kind: "risk" as const,
          point: "経歴の連続性",
        },
        {
          content: "長期的なキャリアプランの記載がなく、定着性を確認したい。",
          kind: "risk" as const,
          point: "長期的な意向",
        },
      ],
      job: "雲帆テック / コミュニティ運営",
      name: "渚カヲル",
      stage: "書類選考",
      summary:
        "心理学の素養がありユーザー理解に強い。直近 2 年はフリーランスで、経歴の連続性は要確認。",
      verdict: "保留",
      work: [
        {
          period: "2024–現在",
          primary: "フリーランス",
          secondary: "コミュニティコンサルタント",
        },
        {
          period: "2019–2024",
          primary: "エコーソーシャル",
          secondary: "ユーザーリサーチャー",
        },
      ],
    },
    "00006": {
      detail: "給与交渉中",
      education: [
        {
          period: "2014–2018",
          primary: "上海外国語大学",
          secondary: "英語 · 学士",
        },
      ],
      focus: [
        {
          content: "ライブ配信とコミュニティの連動経験が豊富で、突発対応が速い。",
          kind: "matching" as const,
          point: "臨機応変",
        },
        {
          content: "WeCom・小紅書・抖音のコミュニティを同時に運営。",
          kind: "matching" as const,
          point: "マルチプラットフォーム",
        },
        {
          content: "承認なしでクーポンを配布したことがあり、プロセス意識を確認したい。",
          kind: "risk" as const,
          point: "プロセス順守",
        },
      ],
      job: "雲帆テック / プライベートトラフィック運営",
      name: "真希波・マリ・イラストリアス",
      stage: "オファー交渉",
      summary:
        "プライベートトラフィックとライブ配信の運営 6 年、マルチプラットフォームに強い。プロセス意識は要確認。",
      verdict: "推奨",
      work: [
        {
          period: "2021–現在",
          primary: "沐光コスメ",
          secondary: "プライベートトラフィック運営主任",
        },
        {
          period: "2018–2021",
          primary: "スターキャストメディア",
          secondary: "ライブ配信運営",
        },
      ],
    },
  },
  detail: {
    activityNote: "葛城ミサト · 履歴書を登録し、コミュニティ運営の職務に紐付け",
    activityTab: "アクティビティ",
    aiEvaluationTab: "AI 評価",
    aiInterviewTab: "AI 初回面接",
    backTo: (page: string) => `${page}に戻る`,
    candidateInfo: "候補者情報",
    careerTab: "経歴概要",
    enterHuman: "対面面接へ進める",
    enterMeeting: "面接会議に参加",
    enterOffer: "オファー交渉へ進める",
    humanInterviewTab: "対面面接",
    launchAi: "AI 初回面接を開始",
    markClosed: "終了にする",
    overviewSummary:
      "コミュニティ運営 3 年、40 以上の都市別グループを担当。月間アクティブ率を 18% から 36% に向上。",
    overviewTab: "概要",
    previewResume: "履歴書をプレビュー",
    profileFields: {
      email: "メール",
      name: "氏名",
      phone: "電話",
      relatedJob: "関連求人",
      targetRole: "希望職種",
      workYears: "経験年数",
    },
    recentActivity: "最近のアクティビティ",
    refreshInfo: "情報を更新",
    scheduleHuman: "対面面接を設定",
    stages: {
      "ai-completed": "AI 初回面接 · 完了",
      "human-completed": "対面面接 · 合格",
      "human-live": "対面面接 · 進行中",
      "human-scheduled": "対面面接 · 設定済み",
      invited: "AI 初回面接 · 開始済み",
      live: "AI 初回面接 · 進行中",
      offer: "オファー交渉 · 送付済み",
      screening: "書類選考 · 合格",
    },
    tabsLabel: "候補者詳細",
    viewEvaluationDetails: "AI 評価の詳細を見る",
    workYears: "3 年",
  },
  dialog: {
    aiQuestions: "AI 面接の質問",
    close: "閉じる",
    closeLabel: "デモダイアログを閉じる",
    experienceTab: "職歴",
    generated: "生成済み · 3 問",
    invitationLabel: "候補者専用の面接リンク",
    invitationValidity: "有効期限：7 日 · 第 1 回 AI 初回面接を開始済み",
    overviewTab: "履歴書の概要",
    questionKinds: ["プロジェクト経験", "炎上対応", "データ振り返り"],
    questionLabel: (index: number, kind: string) => `質問 ${index} · ${kind}`,
    questionsTab: "面接の質問",
    resumeDetails: "履歴書の詳細",
    saveSchedule: "日程を保存",
    scheduleFields: {
      candidate: "候補者",
      end: "終了時刻",
      format: "面接形式",
      formatValue: "ビデオ面接",
      interviewer: "面接官",
      name: "面接名",
      start: "開始時刻",
    },
    scheduleFocusBody:
      "AI 初回面接で確認したプロジェクトの根拠をもとに、イベント企画・炎上対応・データ定義を検証します。候補者と面接官の双方がこの日程を確認済みです。",
    scheduleFocusTitle: "面接の重点",
    structuredResume: "構造化履歴書",
    viewCandidatePage: "候補者の面接ページを見る",
  },
  evaluation: {
    conciseOverall:
      "シンジはローカルサービスのコミュニティ運営を 3 年経験し、40 以上の都市別グループを単独で担当。新規獲得・活性化・振り返りのいずれも定量的な成果があり、コミュニティ運営職との適合度は高い。面接へ進めることを推奨。",
    dimensions: {
      educationBackground:
        "華東師範大学 新聞・コミュニケーション学部卒。コンテンツ企画とユーザーとの対話の基礎があり、職務要件に合致。",
      experienceRelevance:
        "コミュニティ・プライベートトラフィック運営 3 年。獲得・活性化・イベント・炎上対応を網羅し、職務と直接関連。",
      potential:
        "運営アシスタントから都市コミュニティ責任者に成長し、SOP やインセンティブ制度を自ら整備。今後の成長が期待できる。",
      projectMatch:
        "「週末来店チェックイン」などを企画から振り返りまで主導し、イベント運営の要件に合致。",
      skillMatch:
        "WeCom SCRM、アンケート、ダッシュボードを使いこなし、セグメント運営とデータ振り返りを単独で行える。",
      stability: "2 社でそれぞれ 2 年・3 年勤務し、退職理由も明確。全体として定着性は良好。",
    },
    judgment:
      "**強く推奨。** コミュニティ構築、イベント企画、データ振り返りの経験がコミュニティ運営職と高く合致し、都市別コミュニティ群を単独で担当できる。",
    matchingEvidence: [
      {
        content: "イベントの企画から実施までの記録があり、成果が定量化されている。",
        jobRequirement: "コミュニティイベントを単独で企画・実施した経験",
        point: "イベント企画",
        resumeEvidence: "「週末来店チェックイン」を主導し、3 週間で新規 4,200 人、来店利用率 27%",
      },
      {
        content: "活性度の向上が定量的に記録されており、活性化の要件を満たす。",
        jobRequirement: "コミュニティの活性度と定着率を継続的に高められる",
        point: "コミュニティ活性化",
        resumeEvidence: "月間アクティブ率を 18% から 36% に向上、3 か月連続で 33% 以上",
      },
      {
        content: "運営規模が要件に達しており、セグメント運営の経験もある。",
        jobRequirement: "1 万人以上のコミュニティ運営経験",
        point: "コミュニティ規模",
        resumeEvidence: "40 以上の都市別グループ、累計メンバー 2.6 万人を担当",
      },
    ],
    risks: [
      {
        content:
          "プロダクトやサポートとの協働方法の記載がなく、プロジェクトも単独推進が中心。対面面接で重点的に確認が必要。",
        jobRequirement: "プロダクト・サポートなど他チームと連携して推進できる",
        point: "部門横断の協働",
        resumeEvidence: null,
      },
    ],
    seniorityLevel: "コミュニティ運営（ミドル）",
    seniorityRationale: "都市別コミュニティ群を単独で担当し、グロースチームの施策を支援できる。",
    teamRationale:
      "主要都市のユーザーグループとコミュニティイベントを担当し、コンテンツ・グロースチームと連携する役割に適する。",
    teamSuggestion: "コミュニティ運営 / 都市コミュニティ責任者",
  },
  evaluationUi: {
    basis: {
      both: "職務要件と一般的な職業基準に基づく分析",
      general: "一般的な職業基準に基づく分析",
      job: "職務要件に基づく分析",
    },
    dimensionLabels: {
      educationBackground: "学歴・背景",
      experienceRelevance: "経験の関連性",
      potential: "ポテンシャル",
      projectMatch: "プロジェクト適合",
      skillMatch: "スキル適合",
      stability: "安定性",
    },
    dimensionsTitle: "6 軸評価",
    jobRequirement: "職務要件",
    judgment: "判断",
    levels: {
      highly_recommended: "強く推奨",
      recommended: "推奨",
    },
    matchingEvidence: "適合の根拠",
    notMentioned: "履歴書に記載なし",
    overallTitle: "総合評価",
    radarLabel: "履歴書 6 軸定性評価レーダーチャート",
    recommendation: "推奨度",
    resumeEvidence: "履歴書の根拠",
    risks: "リスクと確認事項",
    seniority: "等級の提案",
    team: "チームでの位置づけ",
  },
  humanEvaluation: {
    detailedAnalysis:
      "イベント企画：目標・予算・振り返り指標を明確に説明でき、判断に根拠がある。\nデータ定義：月間アクティブの定義と対照群の設計を説明でき、セール期などの影響を除外している。\n協働：サポートや事業部門との連携フローが明確で、課題をクローズまで導ける。",
    overallEvaluation:
      "**業務面接の通過を推奨。** シンジはコミュニティイベントの企画と振り返り、炎上対応の流れを明確に説明でき、データ定義の検証方法も信頼できる。コミュニティ運営職に適合。",
    professionalSkill: "優",
    rating: "A",
    risks:
      "部門横断で進める際は慎重で、リソース調整に上長の支援が必要。大規模イベントの予算管理経験は限定的。",
    rolePosition: "コミュニティ運営 / 都市コミュニティ責任者",
    salaryRecommendation: "月給 ¥18,000–20,000、別途四半期業績賞与",
    strengths:
      "イベントを一貫して回せる、データ定義が明確、ダッシュボードをもとに戦略を調整できる、ユーザー対応が丁寧。",
  },
  humanInterview: {
    focusItems: [
      "「週末来店チェックイン」の目標と予算をどう設定しましたか？",
      "苦情が集中したとき、サポートとどう連携しますか？",
      "活性化施策が月間アクティブに与えた実際の効果をどう検証しますか？",
    ],
    focusNote: "AI 初回面接で確認したプロジェクトの根拠をもとに、重要な判断を深掘りします。",
    focusTitle: "今回の面接の重点",
    history: "過去の面接",
    pending: "対応待ち",
    progressDescription: "面接日程、各回の結果、面接評価を確認",
    progressTitle: "対面面接の進捗",
    roundLabel: "業務面接",
    schedule: "面接を設定",
  },
  job: {
    label: "雲帆テック / コミュニティ運営",
    title: "コミュニティ運営",
  },
  liveInterview: {
    camera: "カメラ",
    deviceSettings: (device: string) => `${device}の設定`,
    endInterview: "面接を終了",
    microphone: "マイク",
    roundLabel: "AI 初回面接",
    transcript: "対話記録",
  },
  meetingInfo: {
    job: "求人",
    responsibleHr: "担当 HR",
    round: "面接回",
    time: "会議日時",
    timeValue: "2026年10月9日 14:00",
    title: "会議情報",
  },
  offer: {
    copyLink: "オファーリンクをコピー",
    edit: "編集",
    expectations: [
      {
        label: "希望月給",
        value: "¥ 20,000",
      },
      {
        label: "現在の月給",
        value: "¥ 16,000",
      },
      {
        label: "本採用後の給与",
        value: "¥ 19,000",
      },
      {
        label: "試用期間の給与",
        value: "¥ 19,000",
      },
      {
        label: "最短入社日",
        value: "2026/11/02",
      },
      {
        label: "備考",
        value: "業務面接を通過、待遇は合意済み",
      },
    ],
    expectationsNote: "オファー前に候補者の希望を集め、交渉の参考にします。",
    expectationsTitle: "候補者の希望",
    fields: [
      {
        label: "職位",
        value: "コミュニティ運営（ミドル）",
      },
      {
        label: "基本月給",
        value: "¥ 19,000",
      },
      {
        label: "年間賞与",
        value: "¥ 38,000",
      },
      {
        label: "福利厚生",
        value: "補足医療保険と年次健康診断",
      },
      {
        label: "入社予定日",
        value: "2026/11/02",
      },
      {
        label: "オファー有効期限",
        value: "2026/10/16",
      },
      {
        label: "メール状況",
        value: "shinji@example.com に送信済み · 10/10 10:05",
      },
    ],
    notes:
      "業務面接を通過し、待遇はユーザーグロース部の責任者と確認済み。試用期間 3 か月、給与は 100% 支給。",
    notesLabel: "備考",
    progress: {
      current: (label: string) => `現在：${label}`,
      label: "オファー交渉の進捗",
      step: (index: number, total: number) => `ステップ ${index}/${total}`,
      steps: ["給与明細", "給与交渉", "オファー送付", "身元調査"],
      task: "現在の段階：オファーを公開し、候補者の確認待ち。承諾後に身元調査へ進みます。",
    },
    reEvaluate: "再評価",
    recordResponse: "候補者の回答を記録",
    sent: "送付済み",
    title: "オファー · 第 1 版",
  },
  people: {
    candidate: "碇シンジ",
    interviewer: "赤木リツコ",
    recruiter: "葛城ミサト",
  },
  resume: {
    education: [
      {
        period: "2017–2021",
        primary: "華東師範大学",
        secondary: "新聞・コミュニケーション学 · 学士",
      },
    ],
    educationTitle: "学歴",
    fileName: "碇シンジ_コミュニティ運営.pdf",
    previewSubtitle: "3 年 · コミュニティ構築 · イベント企画 · データ振り返り",
    skills: ["セグメント運営", "イベント企画", "WeCom SCRM", "データ振り返り"],
    skillsTitle: "スキル",
    summary:
      "コミュニティ運営 3 年、都市別コミュニティ群を単独で担当。獲得と活性化の成果が職務の中核要件と高く合致。",
    work: [
      {
        period: "2023–現在",
        primary: "拾光ライフ",
        secondary: "コミュニティ運営",
        summary:
          "40 以上の都市別グループの獲得と活性化を担当し、「週末来店チェックイン」などのイベントを主導。",
      },
      {
        period: "2021–2023",
        primary: "茶嶼ティー",
        secondary: "プライベートトラフィック運営アシスタント",
        summary:
          "店舗の WeCom グループ立ち上げを支援し、日々のコンテンツ配信とキャンペーンを担当。",
      },
    ],
    workTitle: "職歴",
  },
  room: {
    aiEvaluation: "AI 評価",
    camera: "カメラオフ",
    candidateInfo: "候補者情報",
    candidateOverview: "候補者の概要",
    candidateRole: "候補者",
    chat: "チャット",
    closeQuestions: "面接質問を閉じる",
    closeReview: "評価を閉じる",
    endMeeting: "会議を終了",
    evaluationDetails: "評価の詳細",
    fullscreenResume: "履歴書を全画面で見る",
    history: [
      {
        label: "志望動機",
        value: "より大きな環境で、コミュニティ成長の一連の流れを担いたい。",
      },
      {
        label: "現状と入社時期",
        value: "在職中。オファー確定後 2 週間以内に入社可能。",
      },
      {
        label: "給与の現状と希望",
        value: "現在の月給 ¥16,000、希望は ¥18,000–20,000。",
      },
      {
        label: "実績・昇給・昇進",
        value: "昨年の評価は A。運営アシスタントから都市コミュニティ責任者に昇進。",
      },
      {
        label: "直近の職歴",
        value: "拾光ライフのコミュニティ運営として、都市別グループの獲得・活性化・炎上対応を担当。",
      },
      {
        label: "注目プロジェクト",
        value:
          "「週末来店チェックイン」で 3 週間に新規 4,200 人。月間アクティブ率を 18% から 36% に向上し、3 か月で検証。",
      },
    ],
    historyRoundLabel: "AI 初回面接 · 86 点 · 対面面接を推奨",
    hostRole: "ホスト",
    hrInitial: "HR 初回面接",
    meetingView: "会議ビュー",
    microphone: "マイク",
    participants: "参加人数",
    questions: "面接質問",
    recording: "録画中",
    referenceNote:
      "AI 初回面接で確認した回答をもとに、プロジェクトの詳細と判断の取捨を引き続き確認します。",
    referenceQuestion: (index: number) => `参考質問 ${index}`,
    review: "評価",
    reviewDescription: "入力内容は毎秒自動保存されます。会議後に仕上げて提出してください。",
    reviewFields: {
      conclusion: "私の結論",
      overall: "総合評価",
      professionalSkill: "専門スキル",
      rating: "評価ランク",
      risks: "弱み・リスク",
      rolePosition: "役割の位置づけ",
      salary: "給与の提案",
      strengths: "強み",
    },
    reviewTitle: "面接評価",
    self: "（自分）",
    shareScreen: "画面共有",
    submitReview: "評価を提出",
    subtitles: "字幕",
    timeline: "評価タイムライン",
    toggleTheme: "テーマを切り替え",
  },
  round: {
    attendance: "参加状況",
    detailedAnalysis: "詳細な分析",
    evaluationStatus: "評価 · 提出済み",
    evaluationTitle: "面接評価",
    format: "オンライン面接",
    hideDetails: "詳細な分析を閉じる",
    interviewer: "面接官",
    outcomePass: "合格",
    scheduledAt: "10月9日 14:00 – 15:00",
    showDetails: "詳細な分析を表示",
    status: "状態",
    statusCompleted: "完了",
    statusScheduled: "面接待ち",
    title: (index: number, label: string) => `第 ${index} 回 · ${label}`,
  },
  shell: {
    themeToggle: "デモのテーマを切り替え",
    workbench: "デモワークスペース",
  },
  stages: {
    aiCompleted: "完了 · 86 点",
    aiInterview: "AI 面接",
    humanInterview: "対面面接",
    humanPassed: "完了 · 合格",
    inProgress: "進行中",
    invited: "開始済み",
    offer: "オファー交渉",
    offerSent: "送付済み",
    qualified: "合格",
    scheduled: "設定済み",
    screening: "書類選考",
  },
  tour: {
    aiResult: "AI 初回面接は 86 点、対面面接を推奨",
    aiTranscript: "評価から対話に戻り、回答の根拠を確認",
    backToMaterials: "会議資料ビューに戻る",
    backToMeeting: "候補者の文脈を保ったままビデオ会議に戻る",
    candidate: "碇シンジ · コミュニティ運営、プロフィール全体を表示",
    detailBack: "採用デスクに戻ると、同じ記録がオファー交渉に進んでいる",
    enterInterview: "候補者は専用リンクから音声面接に参加",
    enterRoom: "シンジの業務面接に参加",
    evaluation: "履歴書評価：強く推奨、6 軸の根拠を確認できる",
    finishAi: "AI 初回面接が完了し、碇シンジの結果に戻る",
    finishHuman: "再面接が完了し、碇シンジの記録と評価に戻る",
    humanAnalysis: "評価 A、専門スキル優。都市コミュニティ責任者を推奨",
    humanResult: "業務面接は A 評価、合格",
    humanSchedule: "同じ記録で対面面接の予定を確認",
    initialInfo: "初回面接で集めたプロジェクト・給与・入社時期を確認",
    launch: "同じ候補者の AI 初回面接を開始",
    resumeEvaluation: "AI 履歴書評価で適合の根拠とリスクを確認",
    resumeFullscreen: "履歴書を拡大し、同じ候補者のプロジェクト経験を確認",
    roomMaterials: "会議を離れずに候補者資料を確認",
    roomQuestions: "参考質問を開き、根拠をもとに深掘り",
    roomReview: "会議内で面接官の評価フォームを開く",
    scheduleConfirmed: "面接日程と面接官を確認済み",
    transitionHuman: "シンジを対面面接に進め、業務面接を設定",
    transitionOffer: "対面面接に合格し、同じ候補者のオファー交渉へ",
    turnOne: "AI がイベントについて深掘りし、具体的な貢献を記録",
    turnTwo: "月間アクティブの定義を追加で確認し、元の回答と根拠を保持",
  },
};
