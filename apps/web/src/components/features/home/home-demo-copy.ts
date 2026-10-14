import { getLocale } from "@/paraglide/runtime";

const HOME_DEMO_COPY = {
  en: {
    feature: {
      avatarLabel: "Avatar for Asuka",
      calibrationComment:
        "The risk was clarified in follow-ups. Validate her willingness to fight in formation in the next round.",
      calibrationComplete: "3 interviewers calibrated",
      candidateName: "Asuka",
      candidateRole: "Eva Unit-02 Pilot · 10 years of training",
      dimensionLabels: {
        educationBackground: "Education",
        experienceRelevance: "Experience relevance",
        potential: "Potential",
        projectMatch: "Project fit",
        skillMatch: "Skill fit",
        stability: "Stability",
      },
      interviewerAvatar: "Interviewer Misato's avatar",
      low: "Low",
      matchBody: "Combat skills and mission complexity are backed by direct sortie records.",
      matchLead: "Strong overall fit.",
      metrics: { evidence: "Evidence coverage", fit: "Capability fit", risk: "Risk" },
      overallScore: "Overall score",
      radarAria: "Asuka's six-dimension resume score",
      radarLabels: {
        educationBackground: "Education",
        experienceRelevance: "Experience",
        potential: "Potential",
        projectMatch: "Projects",
        skillMatch: "Skills",
        stability: "Stability",
      },
      recommendInterview: "Interview recommended",
      recommendNext: "Advance",
    },
    principles: [
      {
        description:
          "Align responsibilities, requirements, and screening gates first, so every later step shares one standard.",
        label: "Job context",
        title: "Define what good looks like first.",
      },
      {
        description:
          "Strengths and risks link to the resume, so you can see where every conclusion comes from.",
        label: "Resume screening",
        title: "Keep evidence beside every conclusion.",
      },
      {
        description:
          "When an answer is vague, ask for examples, roles, and results until it is specific.",
        label: "AI interview",
        title: "If it is unclear, keep asking.",
      },
      {
        description:
          "Conversations, recordings, and structured evaluations live together. No more reviewing from scattered impressions.",
        label: "Evaluation",
        title: "Move from records back to judgment.",
      },
      {
        description:
          "Start from what the AI interview confirmed and what is still open, and spend time on the key questions.",
        label: "Human interview",
        title: "Let people judge what truly matters.",
      },
      {
        description:
          "Recruiters and hiring managers share one candidate context, so handoffs need no retelling.",
        label: "Teamwork",
        title: "One candidate. One set of facts.",
      },
      {
        description: "No sign-up or install. Follow the prompts and focus on answering.",
        label: "Candidate experience",
        title: "Open the link and begin.",
      },
      {
        description:
          "Key answers, follow-ups, and evaluation evidence are kept together for a full review anytime.",
        label: "Process record",
        title: "Never lose an answer.",
      },
      {
        description: "From screening to AI and live interviews, every move has a clear status.",
        label: "Multi-stage hiring",
        title: "Clear stages. Natural handoffs.",
      },
      {
        description:
          "Compare capability and evidence before asking who fits best. One score never replaces judgment.",
        label: "Candidate comparison",
        title: "Differences matter more than rankings.",
      },
      {
        description: "After a decision, return to the resume, answers, and evidence behind it.",
        label: "Hiring review",
        title: "Every decision remains reviewable.",
      },
      {
        description:
          "AI organizes evidence, fills question gaps, and offers guidance. Your team makes the final call.",
        label: "Human–AI boundary",
        title: "AI provides grounds. People decide.",
      },
    ],
    process: {
      decision: {
        collected: "All feedback received",
        facts: [
          ["Capability fit", "88"],
          ["Evidence coverage", "84"],
          ["Stability", "78"],
        ],
        finalDecision: "Final decision",
        finalValue: "Advance to the next interview",
        headers: ["Interviewer", "Judgment", "Rationale"],
        subtitle: "3 interviewers · One evidence base",
        summary:
          "Core combat capability has direct sortie evidence, and formation teamwork was confirmed in the live interview.",
        title: "Asuka · Team review",
        verdicts: [
          ["Misato", "Advance", "Core capability is clear"],
          ["Ritsuko", "Advance", "Risk confirmed"],
          ["Gendo", "Proceed", "Evidence is comprehensive"],
        ],
      },
      evidence: {
        avatarLabel: "Avatar for Asuka",
        items: [
          [
            "Multi-unit combat",
            "Defeated the Seventh Angel in sync with Unit-01",
            "Resume · Page 2",
          ],
          ["Outcome", "Finished the twin-unit kill in 62 seconds", "Combat record"],
          [
            "Risk to confirm",
            "Solo-action tendency and formation teamwork not described",
            "Follow-up needed",
          ],
        ],
        name: "Asuka · Resume screening",
        originalLines: [
          "Led Unit-02 in the synchronized twin-unit strike on the Seventh Angel and set the attack timing.",
          "Completed the twin-unit kill within 62 seconds.",
          "Formation teamwork and solo-action boundaries were not described.",
        ],
        originalTitle: "Resume source · Page 2",
        overallScore: "Overall score",
        role: "Eva Unit-02 Pilot · 10 years of training",
      },
      interview: {
        count: "3 items to validate",
        footers: ["Interview answers update evidence coverage", "Synced with interviewers"],
        headers: ["Dimension to validate", "Human interview question"],
        questions: [
          [
            "Mission ownership",
            "Which key decisions did you personally make in the Seventh Angel operation?",
            "From resume evidence",
          ],
          [
            "Outcome validation",
            "How was the 62-second kill time measured?",
            "From outcome evidence",
          ],
          [
            "Risk confirmation",
            "Where do you draw the line between acting solo and holding formation?",
            "From unresolved risk",
          ],
        ],
        subtitle: "Prepared from unresolved resume items",
        title: "Asuka · Human interview questions",
      },
      role: {
        criteria: [
          ["Neural sync and unit control", "40%", "w-full"],
          ["Multi-unit combat", "35%", "w-[88%]"],
          ["Tactical judgment and command", "25%", "w-[63%]"],
        ],
        hardRequirements: "Sync ratio 60%+ · Combat record · Formation work",
        hardRequirementsLabel: "Hard requirements",
        scope: "Screening, live interviews, and Operations review",
        scopeLabel: "Used for",
        subtitle: "Role benchmark · Version 3",
        title: "Eva Unit-02 Pilot",
        updated: "Updated today at 10:24",
        weights: "Capability weights",
      },
    },
  },
  ja: {
    feature: {
      avatarLabel: "アスカのアバター",
      calibrationComment:
        "リスク項目は追加質問で確認済みです。次回は編隊での連携姿勢を重点的に検証します。",
      calibrationComplete: "面接官 3 名が調整済み",
      candidateName: "アスカ",
      candidateRole: "エヴァ弐号機パイロット · 訓練 10 年",
      dimensionLabels: {
        educationBackground: "学歴・背景",
        experienceRelevance: "経験の関連性",
        potential: "ポテンシャル",
        projectMatch: "プロジェクト適合",
        skillMatch: "スキル適合",
        stability: "安定性",
      },
      interviewerAvatar: "ミサト面接官のアバター",
      low: "低",
      matchBody: "戦闘スキルと作戦の複雑さには直接的な出撃記録の裏付けがあります。",
      matchLead: "総合的に適合。",
      metrics: { evidence: "根拠の充実度", fit: "能力適合", risk: "リスク" },
      overallScore: "総合スコア",
      radarAria: "アスカの履歴書 6 軸評価",
      radarLabels: {
        educationBackground: "学歴",
        experienceRelevance: "経験",
        potential: "潜在力",
        projectMatch: "案件",
        skillMatch: "スキル",
        stability: "安定性",
      },
      recommendInterview: "面接を推奨",
      recommendNext: "次へ進める",
    },
    principles: [
      {
        description: "責任、能力要件、選考基準を先に揃え、以降のすべての段階で同じ基準を使います。",
        label: "職務コンテキスト",
        title: "適任とは何かを先に定義。",
      },
      {
        description: "強みとリスクを履歴書原文に結び付け、結論の出どころがひと目で分かります。",
        label: "書類選考",
        title: "結論のそばに、必ず根拠を。",
      },
      {
        description: "回答が曖昧なら、事例・役割・成果を具体的になるまで質問します。",
        label: "AI 面接",
        title: "明確になるまで、掘り下げる。",
      },
      {
        description: "会話、録音、構造化評価をまとめ、断片的な印象に頼らず振り返れます。",
        label: "評価",
        title: "記録から、判断へ戻る。",
      },
      {
        description: "AI 面接で確認済みの点と未確認の点を踏まえ、重要な質問に時間を使います。",
        label: "対人面接",
        title: "重要なことを、人が判断。",
      },
      {
        description: "採用担当と採用マネージャーが同じ候補者情報を共有し、引き継ぎの説明が不要に。",
        label: "チーム連携",
        title: "一人の候補者、一つの事実。",
      },
      {
        description: "登録もインストールも不要。案内に沿って回答に集中できます。",
        label: "候補者体験",
        title: "リンクを開けば、すぐ開始。",
      },
      {
        description: "重要な回答、追加質問、評価根拠をまとめて保存し、いつでも振り返れます。",
        label: "プロセス記録",
        title: "すべての回答を残す。",
      },
      {
        description: "書類選考から AI 面接、対面面接まで、各段階の状態が明確です。",
        label: "複数段階の採用",
        title: "明確な段階、自然な引き継ぎ。",
      },
      {
        description: "能力と根拠の違いを比べてから適任者を議論。一つのスコアで判断を代えません。",
        label: "候補者比較",
        title: "順位より、違いが重要。",
      },
      {
        description: "決定後も、当時の履歴書・回答・評価根拠に戻れます。",
        label: "採用の振り返り",
        title: "すべての判断を見直せる。",
      },
      {
        description:
          "AI は根拠を整理し、質問の抜けを補い、参考を示します。最終判断は採用チームが行います。",
        label: "人と AI の境界",
        title: "AI は根拠を、人が判断を。",
      },
    ],
    process: {
      decision: {
        collected: "全員の意見を収集済み",
        facts: [
          ["能力適合", "88"],
          ["根拠の充実度", "84"],
          ["安定性", "78"],
        ],
        finalDecision: "最終判断",
        finalValue: "次の対人面接へ進む",
        headers: ["面接官", "判断", "根拠"],
        subtitle: "面接官 3 名 · 同じ根拠",
        summary: "中核の戦闘能力には直接的な出撃根拠があり、編隊での連携も対人面接で確認済みです。",
        title: "アスカ · チームレビュー",
        verdicts: [
          ["ミサト", "次へ", "中核能力が明確"],
          ["リツコ", "次へ", "リスク確認済み"],
          ["ゲンドウ", "進行", "根拠が十分"],
        ],
      },
      evidence: {
        avatarLabel: "アスカのアバター",
        items: [
          ["複数機連携作戦", "初号機と同期して第7使徒を殲滅", "履歴書 · 2 ページ"],
          ["成果", "62 秒で二機同時殲滅を完了", "戦闘記録"],
          ["未確認リスク", "単独行動の傾向と編隊連携が未記載", "追加質問が必要"],
        ],
        name: "アスカ · 書類選考",
        originalLines: [
          "第7使徒への二機同時攻撃で弐号機を率い、攻撃のタイミングを決定。",
          "62 秒以内に二機同時殲滅を完了。",
          "編隊連携と単独行動の境界は未記載。",
        ],
        originalTitle: "履歴書原文 · 2 ページ",
        overallScore: "総合スコア",
        role: "エヴァ弐号機パイロット · 訓練 10 年",
      },
      interview: {
        count: "検証項目 3 件",
        footers: ["面接回答を根拠の充実度へ反映", "面接官へ共有済み"],
        headers: ["検証する観点", "対人面接の質問"],
        questions: [
          ["作戦の責任", "第7使徒戦で、本人が担った重要な意思決定は？", "履歴書の根拠から"],
          ["成果の検証", "62 秒という殲滅時間はどのように計測しましたか？", "成果の根拠から"],
          ["リスク確認", "単独行動と編隊維持の判断基準を説明してください。", "未確認項目から"],
        ],
        subtitle: "履歴書の未確認項目から作成",
        title: "アスカ · 対人面接の質問",
      },
      role: {
        criteria: [
          ["神経シンクロと機体操縦", "40%", "w-full"],
          ["複数機連携作戦", "35%", "w-[88%]"],
          ["作戦判断と指揮連携", "25%", "w-[63%]"],
        ],
        hardRequirements: "シンクロ率 60% 以上 · 実戦経験 · 編隊連携",
        hardRequirementsLabel: "必須条件",
        scope: "書類選考、対人面接、作戦部レビュー",
        scopeLabel: "利用範囲",
        subtitle: "職務基準 · 第 3 版",
        title: "エヴァ弐号機パイロット",
        updated: "本日 10:24 更新",
        weights: "能力ウェイト",
      },
    },
  },
  ko: {
    feature: {
      avatarLabel: "아스카의 프로필 이미지",
      calibrationComment:
        "추가 질문으로 위험 요소를 확인했습니다. 다음 면접에서는 편대 협동 의지를 중점적으로 검증하세요.",
      calibrationComplete: "면접관 3명 조율 완료",
      candidateName: "아스카",
      candidateRole: "에반게리온 2호기 파일럿 · 훈련 10년",
      dimensionLabels: {
        educationBackground: "학력/배경",
        experienceRelevance: "경험 관련성",
        potential: "잠재력",
        projectMatch: "프로젝트 적합도",
        skillMatch: "기술 적합도",
        stability: "안정성",
      },
      interviewerAvatar: "미사토 면접관의 프로필 이미지",
      low: "낮음",
      matchBody: "전투 기술과 작전 복잡성 모두 직접 출격 기록으로 뒷받침됩니다.",
      matchLead: "전반적으로 적합합니다.",
      metrics: { evidence: "근거 충실도", fit: "역량 적합도", risk: "위험" },
      overallScore: "종합 점수",
      radarAria: "아스카의 6개 항목 이력서 점수",
      radarLabels: {
        educationBackground: "학력",
        experienceRelevance: "경험",
        potential: "잠재력",
        projectMatch: "프로젝트",
        skillMatch: "기술",
        stability: "안정성",
      },
      recommendInterview: "면접 추천",
      recommendNext: "다음 단계 진행",
    },
    principles: [
      {
        description: "책임, 역량 요건, 심사 기준을 먼저 맞춰 이후 모든 단계가 같은 기준을 씁니다.",
        label: "직무 맥락",
        title: "적합한 인재의 기준을 먼저 정의합니다.",
      },
      {
        description: "강점과 리스크를 이력서 원문에 연결해 결론의 출처를 한눈에 보여 줍니다.",
        label: "이력서 심사",
        title: "모든 결론 곁에 근거를 둡니다.",
      },
      {
        description: "답변이 모호하면 사례, 역할, 결과를 구체적으로 나올 때까지 묻습니다.",
        label: "AI 면접",
        title: "분명해질 때까지 계속 질문합니다.",
      },
      {
        description: "대화, 녹음, 구조화된 평가를 함께 두어 흩어진 인상에 기대지 않고 검토합니다.",
        label: "평가",
        title: "기록에서 다시 판단으로 돌아갑니다.",
      },
      {
        description: "AI 면접에서 확인된 점과 남은 의문을 보고 핵심 질문에 시간을 씁니다.",
        label: "대면 면접",
        title: "정말 중요한 것을 사람이 판단합니다.",
      },
      {
        description:
          "채용 담당자와 채용 관리자가 같은 후보자 맥락을 공유해 인수인계 설명이 필요 없습니다.",
        label: "팀 협업",
        title: "한 명의 후보자, 하나의 사실.",
      },
      {
        description: "가입이나 설치 없이 안내에 따라 답변에만 집중합니다.",
        label: "후보자 경험",
        title: "링크를 열면 바로 시작합니다.",
      },
      {
        description: "핵심 답변, 추가 질문, 평가 근거를 함께 보관해 언제든 다시 봅니다.",
        label: "과정 기록",
        title: "어떤 답변도 놓치지 않습니다.",
      },
      {
        description: "심사부터 AI 면접, 대면 면접까지 모든 진행 단계의 상태가 분명합니다.",
        label: "다단계 채용",
        title: "명확한 단계, 자연스러운 연결.",
      },
      {
        description:
          "역량과 근거의 차이를 비교한 뒤 적합한 사람을 논의합니다. 점수 하나가 판단을 대신하지 않습니다.",
        label: "후보자 비교",
        title: "순위보다 차이가 중요합니다.",
      },
      {
        description: "결정 후에도 당시의 이력서, 답변, 평가 근거로 돌아갈 수 있습니다.",
        label: "채용 회고",
        title: "모든 결정을 다시 검토할 수 있습니다.",
      },
      {
        description:
          "AI는 근거를 정리하고 빠진 질문을 채우며 참고 의견을 줍니다. 최종 결정은 채용 팀이 내립니다.",
        label: "사람과 AI의 경계",
        title: "AI는 근거를, 사람은 판단을.",
      },
    ],
    process: {
      decision: {
        collected: "모든 의견 수집 완료",
        facts: [
          ["역량 적합도", "88"],
          ["근거 충실도", "84"],
          ["안정성", "78"],
        ],
        finalDecision: "최종 결정",
        finalValue: "다음 대면 면접 진행",
        headers: ["면접관", "판단", "근거"],
        subtitle: "면접관 3명 · 하나의 근거",
        summary:
          "핵심 전투 역량에는 직접적인 출격 근거가 있고 편대 협동도 대면 면접에서 확인했습니다.",
        title: "아스카 · 팀 검토",
        verdicts: [
          ["미사토", "진행", "핵심 역량이 분명함"],
          ["리츠코", "진행", "위험 요소 확인 완료"],
          ["겐도", "계속", "근거가 충분함"],
        ],
      },
      evidence: {
        avatarLabel: "아스카의 프로필 이미지",
        items: [
          ["다기체 협동 작전", "초호기와 동기화해 제7사도 섬멸", "이력서 · 2페이지"],
          ["성과", "62초 만에 2기 동시 섬멸 완료", "전투 기록"],
          ["확인할 위험", "단독 행동 경향과 편대 협동이 기재되지 않음", "추가 질문 필요"],
        ],
        name: "아스카 · 이력서 심사",
        originalLines: [
          "제7사도 2기 동시 공격에서 2호기를 이끌고 공격 타이밍을 정했습니다.",
          "62초 안에 2기 동시 섬멸을 완료했습니다.",
          "편대 협동과 단독 행동의 경계는 기재되지 않았습니다.",
        ],
        originalTitle: "이력서 원문 · 2페이지",
        overallScore: "종합 점수",
        role: "에반게리온 2호기 파일럿 · 훈련 10년",
      },
      interview: {
        count: "검증할 항목 3개",
        footers: ["면접 답변을 근거 충실도에 반영", "면접관과 동기화 완료"],
        headers: ["검증 항목", "대면 면접 질문"],
        questions: [
          [
            "작전 책임",
            "제7사도전에서 본인이 직접 내린 핵심 결정은 무엇인가요?",
            "이력서 근거에서 생성",
          ],
          ["성과 검증", "62초라는 섬멸 시간은 어떻게 측정했나요?", "성과 근거에서 생성"],
          [
            "위험 확인",
            "단독 행동과 편대 유지의 판단 기준을 설명해 주세요.",
            "미확인 항목에서 생성",
          ],
        ],
        subtitle: "이력서의 미확인 항목에서 생성",
        title: "아스카 · 대면 면접 질문",
      },
      role: {
        criteria: [
          ["신경 싱크로와 기체 조종", "40%", "w-full"],
          ["다기체 협동 작전", "35%", "w-[88%]"],
          ["작전 판단과 지휘 협동", "25%", "w-[63%]"],
        ],
        hardRequirements: "싱크로율 60% 이상 · 실전 경험 · 편대 협동",
        hardRequirementsLabel: "필수 요건",
        scope: "이력서 심사, 대면 면접, 작전부 검토",
        scopeLabel: "사용 범위",
        subtitle: "직무 기준 · 버전 3",
        title: "에반게리온 2호기 파일럿",
        updated: "오늘 10:24 업데이트",
        weights: "역량 가중치",
      },
    },
  },
  "zh-CN": {
    feature: {
      avatarLabel: "明日香的头像",
      calibrationComment: "风险项已经在追问中确认，建议下一轮重点验证编队配合意愿。",
      calibrationComplete: "3 位面试官已完成校准",
      candidateName: "明日香",
      candidateRole: "EVA 二号机驾驶员 · 训练 10 年",
      dimensionLabels: {
        educationBackground: "学历/背景",
        experienceRelevance: "经验相关性",
        potential: "潜力评估",
        projectMatch: "项目匹配度",
        skillMatch: "技能匹配度",
        stability: "稳定性评估",
      },
      interviewerAvatar: "葛城美里的头像",
      low: "低",
      matchBody: "作战技能与任务复杂度均有直接出击记录支撑。",
      matchLead: "整体匹配。",
      metrics: { evidence: "证据完整", fit: "能力匹配", risk: "风险" },
      overallScore: "综合评分",
      radarAria: "明日香的六维简历评分",
      radarLabels: {
        educationBackground: "学历",
        experienceRelevance: "经验",
        potential: "潜力",
        projectMatch: "项目",
        skillMatch: "技能",
        stability: "稳定",
      },
      recommendInterview: "建议面试",
      recommendNext: "建议复试",
    },
    principles: [],
    process: {
      decision: {
        collected: "意见已收齐",
        facts: [
          ["能力匹配", "88"],
          ["证据完整", "84"],
          ["稳定性", "78"],
        ],
        finalDecision: "最终决定",
        finalValue: "进入下一轮复面",
        headers: ["面试官", "判断", "依据"],
        subtitle: "3 位面试官 · 同一份证据",
        summary: "核心作战能力有直接出击证据，编队配合已在复面中确认。",
        title: "明日香 · 团队评审记录",
        verdicts: [
          ["葛城美里", "建议复试", "核心能力明确"],
          ["赤木律子", "建议复试", "风险已确认"],
          ["碇源堂", "建议推进", "证据较完整"],
        ],
      },
      evidence: {
        avatarLabel: "明日香的头像",
        items: [
          ["多机协同作战", "与初号机同步歼灭第七使徒", "简历 · 第 2 页"],
          ["结果影响", "62 秒内完成双机同步歼灭", "作战记录"],
          ["待确认风险", "单独行动倾向与编队配合未说明", "需要追问"],
        ],
        name: "明日香 · 简历筛选",
        originalLines: [
          "在第七使徒双机同步作战中率领二号机，并决定攻击节奏。",
          "在 62 秒内完成双机同步歼灭。",
          "编队配合与单独行动的边界未说明。",
        ],
        originalTitle: "简历原文 · 第 2 页",
        overallScore: "综合评分",
        role: "EVA 二号机驾驶员 · 训练 10 年",
      },
      interview: {
        count: "3 个待验证项",
        footers: ["面试回答将回写证据完整度", "已同步给面试官"],
        headers: ["待验证维度", "真人复面问题"],
        questions: [
          ["作战所有权", "第七使徒作战中，你本人承担了哪些关键决策？", "来自简历证据"],
          ["结果验证", "62 秒歼灭用时的计时口径是什么？", "来自结果影响"],
          ["风险确认", "请说明单独行动与保持编队的判断边界。", "来自待确认项"],
        ],
        subtitle: "根据简历中的待确认项整理",
        title: "明日香 · 真人复面问题",
      },
      role: {
        criteria: [
          ["神经同步与机体操控", "40%", "w-full"],
          ["多机协同作战", "35%", "w-[88%]"],
          ["作战判断与指挥配合", "25%", "w-[63%]"],
        ],
        hardRequirements: "同步率 60% 以上 · 实战经验 · 编队协同",
        hardRequirementsLabel: "硬性门槛",
        scope: "筛选、复面与作战部评审",
        scopeLabel: "使用范围",
        subtitle: "岗位标尺 · 第 3 版",
        title: "EVA 二号机驾驶员",
        updated: "今天 10:24 更新",
        weights: "能力权重",
      },
    },
  },
} as const;

export function getHomeDemoCopy() {
  return HOME_DEMO_COPY[getLocale()];
}
