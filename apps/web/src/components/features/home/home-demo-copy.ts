import { getLocale } from "@/paraglide/runtime";

const HOME_DEMO_COPY = {
  en: {
    feature: {
      agentMessages: [
        { content: "What did Asuka own in complex frontend projects?", role: "user" },
        {
          content:
            "She led a design-system migration across four product lines and cut average delivery time by 30%. Evidence: resume page 2 and interview answer at 12:36.",
          role: "assistant",
        },
        { content: "Which key decisions did she personally make?", role: "user" },
        {
          content:
            "She scoped the migration, set staged-release and rollback criteria, and aligned product and engineering priorities.",
          role: "assistant",
        },
      ],
      avatarLabel: "Avatar for Asuka",
      calibrationComment:
        "The risk was clarified in follow-ups. Validate team leadership scope in the next round.",
      calibrationComplete: "3 interviewers calibrated",
      calibrationTitle: "Asuka · Overall evaluation",
      candidateName: "Asuka",
      candidateRole: "Senior Frontend Engineer · 8 years",
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
      matchBody: "Core skills and project complexity are backed by direct experience.",
      matchLead: "Strong overall fit.",
      metrics: { evidence: "Evidence coverage", fit: "Capability fit", risk: "Risk" },
      overallScore: "Overall score",
      placeholder: "Ask more about Asuka's projects, evidence, or risks…",
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
      send: "Send to Agent",
    },
    principles: [
      {
        description:
          "Align responsibilities, capability requirements, and screening gates so every later step shares one standard.",
        label: "Job context",
        title: "Define what good looks like first.",
      },
      {
        description:
          "Strengths and risks link to resume text, so every conclusion shows where it came from.",
        label: "Resume screening",
        title: "Keep evidence beside every conclusion.",
      },
      {
        description:
          "When an answer is broad, follow up on examples, ownership, and outcomes until it becomes specific.",
        label: "AI interview",
        title: "If it is unclear, keep asking.",
      },
      {
        description:
          "Keep conversations, recordings, and structured evaluations together instead of relying on scattered impressions.",
        label: "Evaluation",
        title: "Move from records back to judgment.",
      },
      {
        description:
          "Review what the AI interview confirmed and what remains uncertain, then spend human time on the key questions.",
        label: "Human interview",
        title: "Let people judge what truly matters.",
      },
      {
        description:
          "Recruiters and hiring managers share the same candidate context, without repeating every handoff.",
        label: "Teamwork",
        title: "One candidate. One set of facts.",
      },
      {
        description:
          "No registration or app install. Follow clear prompts and focus on communicating experience.",
        label: "Candidate experience",
        title: "Open the link and begin.",
      },
      {
        description:
          "Keep key answers, follow-up paths, and evaluation evidence together for complete review later.",
        label: "Process record",
        title: "Never lose an answer.",
      },
      {
        description:
          "From screening to AI and human interviews, every advance has a clear stage and context.",
        label: "Multi-stage hiring",
        title: "Clear stages. Natural handoffs.",
      },
      {
        description:
          "Compare differences in capability and evidence before discussing fit; never let one score replace judgment.",
        label: "Candidate comparison",
        title: "Differences matter more than rankings.",
      },
      {
        description:
          "Return to the resume, answers, and evidence behind any decision so the process keeps improving.",
        label: "Hiring review",
        title: "Every decision remains reviewable.",
      },
      {
        description:
          "AI organizes evidence, closes question gaps, and gives guidance. The recruiting team always decides.",
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
          "Core capability has direct project evidence, and team scope was confirmed in the human interview.",
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
            "Complex delivery",
            "Led a design-system migration across four product lines",
            "Resume · Page 2",
          ],
          ["Outcome", "Reduced average delivery time by 30%", "Project experience"],
          ["Risk to confirm", "Team size and direct reports not specified", "Follow-up needed"],
        ],
        name: "Asuka · Resume screening",
        originalLines: [
          "Led a design-system migration across four product lines and owned the release strategy.",
          "Reduced average delivery time by 30%.",
          "Team size and direct management scope were not specified.",
        ],
        originalTitle: "Resume source · Page 2",
        overallScore: "Overall score",
        role: "Senior Frontend Engineer · 8 years",
      },
      interview: {
        count: "3 items to validate",
        footers: ["Interview answers update evidence coverage", "Synced with interviewers"],
        headers: ["Dimension to validate", "Human interview question"],
        questions: [
          [
            "Project ownership",
            "Which key decisions did you personally make during the design-system migration?",
            "From resume evidence",
          ],
          [
            "Outcome validation",
            "How was the 30% delivery-time improvement measured?",
            "From outcome evidence",
          ],
          [
            "Risk confirmation",
            "How many direct reports did you have, and where were cross-team boundaries?",
            "From unresolved risk",
          ],
        ],
        subtitle: "Prepared from unresolved resume items",
        title: "Asuka · Human interview questions",
      },
      role: {
        criteria: [
          ["React architecture and engineering", "40%", "w-full"],
          ["Complex project delivery", "35%", "w-[88%]"],
          ["Collaboration and technical decisions", "25%", "w-[63%]"],
        ],
        hardRequirements: "5+ years · Complex projects · Technical decisions",
        hardRequirementsLabel: "Hard requirements",
        scope: "Screening, human interviews, and team review",
        scopeLabel: "Used for",
        subtitle: "Role benchmark · Version 3",
        title: "Senior Frontend Engineer",
        updated: "Updated today at 10:24",
        weights: "Capability weights",
      },
    },
  },
  ja: {
    feature: {
      agentMessages: [
        { content: "アスカは複雑なフロントエンド案件で何を担当しましたか？", role: "user" },
        {
          content:
            "4 製品ラインのデザインシステム移行を主導し、平均リードタイムを 30% 短縮しました。根拠は履歴書 2 ページ目と面接回答 12:36 です。",
          role: "assistant",
        },
        { content: "本人が担った重要な意思決定は？", role: "user" },
        {
          content:
            "移行範囲、段階リリースとロールバック基準を定め、プロダクトと開発の優先順位を調整しました。",
          role: "assistant",
        },
      ],
      avatarLabel: "アスカのアバター",
      calibrationComment:
        "リスク項目は追加質問で確認済みです。次回はチームマネジメント規模を重点的に検証します。",
      calibrationComplete: "面接官 3 名が調整済み",
      calibrationTitle: "アスカ · 総合評価",
      candidateName: "アスカ",
      candidateRole: "シニアフロントエンドエンジニア · 経験 8 年",
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
      matchBody: "中核スキルとプロジェクトの複雑さには直接的な経験の裏付けがあります。",
      matchLead: "総合的に適合。",
      metrics: { evidence: "根拠の充実度", fit: "能力適合", risk: "リスク" },
      overallScore: "総合スコア",
      placeholder: "アスカのプロジェクト、能力の根拠、リスクをさらに質問…",
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
      send: "Agent に送信",
    },
    principles: [
      {
        description: "責任、能力要件、選考基準を先に揃え、その後の全工程に共通基準を持たせます。",
        label: "職務コンテキスト",
        title: "適任とは何かを先に定義。",
      },
      {
        description: "強みとリスクを履歴書原文へ結び付け、結論と出典を同時に確認できます。",
        label: "書類選考",
        title: "結論のそばに、必ず根拠を。",
      },
      {
        description: "回答が曖昧なら、事例、役割、成果を追加質問し、具体化します。",
        label: "AI 面接",
        title: "明確になるまで、掘り下げる。",
      },
      {
        description: "会話、録音、構造化評価をまとめ、断片的な印象に頼らず振り返れます。",
        label: "評価",
        title: "記録から、判断へ戻る。",
      },
      {
        description: "AI 面接で確認済みの点と未確認の点を見て、人の時間を重要な質問に使います。",
        label: "対人面接",
        title: "重要なことを、人が判断。",
      },
      {
        description:
          "採用担当と採用マネージャーが同じ候補者情報を見て、引き継ぎの説明を減らします。",
        label: "チーム連携",
        title: "一人の候補者、一つの事実。",
      },
      {
        description: "登録もアプリも不要。明確な案内に沿い、経験を伝えることに集中できます。",
        label: "候補者体験",
        title: "リンクを開けば、すぐ開始。",
      },
      {
        description: "重要回答、追加質問、評価根拠をまとめて保存し、必要なときに完全に見直せます。",
        label: "プロセス記録",
        title: "すべての回答を残す。",
      },
      {
        description: "書類選考から AI 面接、対人面接まで、各段階に明確な状態と文脈があります。",
        label: "複数段階の採用",
        title: "明確な段階、自然な引き継ぎ。",
      },
      {
        description: "能力と根拠の違いを見てから適合度を議論し、一つの点数に判断を任せません。",
        label: "候補者比較",
        title: "順位より、違いが重要。",
      },
      {
        description: "判断時の履歴書、回答、評価根拠へ戻り、採用プロセスを継続的に改善します。",
        label: "採用の振り返り",
        title: "すべての判断を見直せる。",
      },
      {
        description:
          "AI は根拠を整理し、質問を補い、参考を提示。最終判断は常に採用チームが行います。",
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
        summary: "中核能力には直接的な案件根拠があり、チーム規模も対人面接で確認済みです。",
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
          ["複雑な案件遂行", "4 製品ラインのデザインシステム移行を主導", "履歴書 · 2 ページ"],
          ["成果", "平均リードタイムを 30% 短縮", "プロジェクト経験"],
          ["未確認リスク", "チーム規模と直属部下の範囲が未記載", "追加質問が必要"],
        ],
        name: "アスカ · 書類選考",
        originalLines: [
          "4 製品ラインのデザインシステム移行を主導し、リリース戦略を担当。",
          "平均リードタイムを 30% 短縮。",
          "チーム規模と直接管理範囲は未記載。",
        ],
        originalTitle: "履歴書原文 · 2 ページ",
        overallScore: "総合スコア",
        role: "シニアフロントエンドエンジニア · 経験 8 年",
      },
      interview: {
        count: "検証項目 3 件",
        footers: ["面接回答を根拠の充実度へ反映", "面接官へ共有済み"],
        headers: ["検証する観点", "対人面接の質問"],
        questions: [
          [
            "案件の責任",
            "デザインシステム移行で、本人が担った重要な意思決定は？",
            "履歴書の根拠から",
          ],
          ["成果の検証", "リードタイム 30% 短縮はどのように測定しましたか？", "成果の根拠から"],
          [
            "リスク確認",
            "直属部下の人数と、チーム間連携の境界を説明してください。",
            "未確認項目から",
          ],
        ],
        subtitle: "履歴書の未確認項目から作成",
        title: "アスカ · 対人面接の質問",
      },
      role: {
        criteria: [
          ["React アーキテクチャと開発基盤", "40%", "w-full"],
          ["複雑な案件遂行", "35%", "w-[88%]"],
          ["連携と技術判断", "25%", "w-[63%]"],
        ],
        hardRequirements: "経験 5 年以上 · 複雑な案件 · 技術判断",
        hardRequirementsLabel: "必須条件",
        scope: "書類選考、対人面接、チームレビュー",
        scopeLabel: "利用範囲",
        subtitle: "職務基準 · 第 3 版",
        title: "シニアフロントエンドエンジニア",
        updated: "本日 10:24 更新",
        weights: "能力ウェイト",
      },
    },
  },
  ko: {
    feature: {
      agentMessages: [
        { content: "아스카는 복잡한 프런트엔드 프로젝트에서 무엇을 담당했나요?", role: "user" },
        {
          content:
            "4개 제품 라인의 디자인 시스템 마이그레이션을 주도해 평균 리드 타임을 30% 단축했습니다. 근거는 이력서 2페이지와 12:36의 면접 답변입니다.",
          role: "assistant",
        },
        { content: "본인이 직접 내린 핵심 결정은 무엇인가요?", role: "user" },
        {
          content:
            "마이그레이션 범위를 정하고 단계별 출시와 롤백 기준을 수립했으며 제품과 개발의 우선순위를 조율했습니다.",
          role: "assistant",
        },
      ],
      avatarLabel: "아스카의 프로필 이미지",
      calibrationComment:
        "추가 질문으로 위험 요소를 확인했습니다. 다음 면접에서는 팀 리더십 범위를 중점적으로 검증하세요.",
      calibrationComplete: "면접관 3명 조율 완료",
      calibrationTitle: "아스카 · 종합 평가",
      candidateName: "아스카",
      candidateRole: "시니어 프런트엔드 엔지니어 · 경력 8년",
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
      matchBody: "핵심 기술과 프로젝트 복잡성 모두 직접 경험으로 뒷받침됩니다.",
      matchLead: "전반적으로 적합합니다.",
      metrics: { evidence: "근거 충실도", fit: "역량 적합도", risk: "위험" },
      overallScore: "종합 점수",
      placeholder: "아스카의 프로젝트, 역량 근거 또는 위험 요소를 더 질문하세요…",
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
      send: "Agent에게 보내기",
    },
    principles: [
      {
        description:
          "책임, 역량 요건, 심사 기준을 먼저 맞춰 이후 모든 단계가 하나의 기준을 공유하게 합니다.",
        label: "직무 맥락",
        title: "적합한 인재의 기준을 먼저 정의합니다.",
      },
      {
        description: "강점과 위험 요소를 이력서 원문에 연결해 모든 결론의 출처를 함께 확인합니다.",
        label: "이력서 심사",
        title: "모든 결론 곁에 근거를 둡니다.",
      },
      {
        description: "답변이 모호하면 사례, 역할, 성과를 추가로 질문해 구체적인 사실로 만듭니다.",
        label: "AI 면접",
        title: "분명해질 때까지 계속 질문합니다.",
      },
      {
        description:
          "대화, 녹음, 구조화된 평가를 한곳에 모아 흩어진 인상에 의존하지 않고 검토합니다.",
        label: "평가",
        title: "기록에서 다시 판단으로 돌아갑니다.",
      },
      {
        description:
          "AI 면접에서 확인한 항목과 남은 불확실성을 살펴 사람의 시간을 핵심 질문에 씁니다.",
        label: "대면 면접",
        title: "정말 중요한 것을 사람이 판단합니다.",
      },
      {
        description:
          "채용 담당자와 채용 관리자가 같은 후보자 맥락을 공유해 인수인계 때마다 설명을 반복하지 않습니다.",
        label: "팀 협업",
        title: "한 명의 후보자, 하나의 사실.",
      },
      {
        description:
          "가입이나 앱 설치 없이 명확한 안내에 따라 자신의 경험을 전달하는 데 집중합니다.",
        label: "후보자 경험",
        title: "링크를 열면 바로 시작합니다.",
      },
      {
        description:
          "핵심 답변, 추가 질문 경로, 평가 근거를 함께 보관해 나중에도 완전하게 검토합니다.",
        label: "과정 기록",
        title: "어떤 답변도 놓치지 않습니다.",
      },
      {
        description:
          "이력서 심사부터 AI 면접과 대면 면접까지 모든 진행 단계에 명확한 상태와 맥락이 있습니다.",
        label: "다단계 채용",
        title: "명확한 단계, 자연스러운 연결.",
      },
      {
        description:
          "역량과 근거의 차이를 확인한 뒤 적합도를 논의하며 하나의 점수가 판단을 대신하지 않게 합니다.",
        label: "후보자 비교",
        title: "순위보다 차이가 중요합니다.",
      },
      {
        description: "결정 당시의 이력서, 답변, 평가 근거로 돌아가 채용 절차를 계속 개선합니다.",
        label: "채용 회고",
        title: "모든 결정을 다시 검토할 수 있습니다.",
      },
      {
        description:
          "AI는 근거를 정리하고 질문의 빈틈을 채우며 참고 정보를 제공합니다. 최종 판단은 언제나 채용 팀이 내립니다.",
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
          "핵심 역량에는 직접적인 프로젝트 근거가 있고 팀 규모도 대면 면접에서 확인했습니다.",
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
          [
            "복잡한 프로젝트 수행",
            "4개 제품 라인의 디자인 시스템 마이그레이션 주도",
            "이력서 · 2페이지",
          ],
          ["성과", "평균 리드 타임 30% 단축", "프로젝트 경험"],
          ["확인할 위험", "팀 규모와 직속 부하 범위가 기재되지 않음", "추가 질문 필요"],
        ],
        name: "아스카 · 이력서 심사",
        originalLines: [
          "4개 제품 라인의 디자인 시스템 마이그레이션을 주도하고 출시 전략을 담당했습니다.",
          "평균 리드 타임을 30% 단축했습니다.",
          "팀 규모와 직접 관리 범위는 기재되지 않았습니다.",
        ],
        originalTitle: "이력서 원문 · 2페이지",
        overallScore: "종합 점수",
        role: "시니어 프런트엔드 엔지니어 · 경력 8년",
      },
      interview: {
        count: "검증할 항목 3개",
        footers: ["면접 답변을 근거 충실도에 반영", "면접관과 동기화 완료"],
        headers: ["검증 항목", "대면 면접 질문"],
        questions: [
          [
            "프로젝트 책임",
            "디자인 시스템 마이그레이션에서 본인이 직접 내린 핵심 결정은 무엇인가요?",
            "이력서 근거에서 생성",
          ],
          ["성과 검증", "리드 타임 30% 단축은 어떻게 측정했나요?", "성과 근거에서 생성"],
          [
            "위험 확인",
            "직속 부하 인원과 팀 간 협업 경계를 설명해 주세요.",
            "미확인 항목에서 생성",
          ],
        ],
        subtitle: "이력서의 미확인 항목에서 생성",
        title: "아스카 · 대면 면접 질문",
      },
      role: {
        criteria: [
          ["React 아키텍처와 엔지니어링", "40%", "w-full"],
          ["복잡한 프로젝트 수행", "35%", "w-[88%]"],
          ["협업과 기술 의사결정", "25%", "w-[63%]"],
        ],
        hardRequirements: "경력 5년 이상 · 복잡한 프로젝트 · 기술 의사결정",
        hardRequirementsLabel: "필수 요건",
        scope: "이력서 심사, 대면 면접, 팀 검토",
        scopeLabel: "사용 범위",
        subtitle: "직무 기준 · 버전 3",
        title: "시니어 프런트엔드 엔지니어",
        updated: "오늘 10:24 업데이트",
        weights: "역량 가중치",
      },
    },
  },
  "zh-CN": {
    feature: {
      agentMessages: [
        { content: "明日香在复杂前端项目里，具体负责过什么？", role: "user" },
        {
          content:
            "她主导了设计系统迁移，覆盖 4 条产品线，并将平均交付周期缩短 30%。证据来自简历第 2 页和面试回答 12:36。",
          role: "assistant",
        },
        { content: "她本人承担了哪些关键决策？", role: "user" },
        {
          content: "她负责划定迁移范围、确定分阶段发布与回滚标准，并协调产品和研发统一优先级。",
          role: "assistant",
        },
      ],
      avatarLabel: "明日香的头像",
      calibrationComment: "风险项已经在追问中确认，建议下一轮重点验证带队规模。",
      calibrationComplete: "3 位面试官已完成校准",
      calibrationTitle: "明日香 · 综合评估",
      candidateName: "明日香",
      candidateRole: "高级前端工程师 · 8 年经验",
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
      matchBody: "核心技能与项目复杂度均有直接经历支撑。",
      matchLead: "整体匹配。",
      metrics: { evidence: "证据完整", fit: "能力匹配", risk: "风险" },
      overallScore: "综合评分",
      placeholder: "继续询问明日香的项目经历、能力证据或风险…",
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
      send: "发送给 Agent",
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
        summary: "核心能力有直接项目证据，带队规模已在复面中确认。",
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
          ["复杂项目交付", "主导 4 条产品线的设计系统迁移", "简历 · 第 2 页"],
          ["结果影响", "将平均交付周期缩短 30%", "项目经历"],
          ["待确认风险", "带队规模与直接管理范围未说明", "需要追问"],
        ],
        name: "明日香 · 简历筛选",
        originalLines: [
          "主导 4 条产品线的设计系统迁移，并负责发布策略。",
          "将平均交付周期缩短 30%。",
          "团队规模与直接管理范围未说明。",
        ],
        originalTitle: "简历原文 · 第 2 页",
        overallScore: "综合评分",
        role: "高级前端工程师 · 8 年经验",
      },
      interview: {
        count: "3 个待验证项",
        footers: ["面试回答将回写证据完整度", "已同步给面试官"],
        headers: ["待验证维度", "真人复面问题"],
        questions: [
          ["项目所有权", "设计系统迁移中，你本人承担了哪些关键决策？", "来自简历证据"],
          ["结果验证", "交付周期缩短 30% 的统计口径是什么？", "来自结果影响"],
          ["风险确认", "请说明直接管理人数，以及跨团队协作边界。", "来自待确认项"],
        ],
        subtitle: "根据简历中的待确认项整理",
        title: "明日香 · 真人复面问题",
      },
      role: {
        criteria: [
          ["React 架构与工程化", "40%", "w-full"],
          ["复杂项目交付", "35%", "w-[88%]"],
          ["协作与技术决策", "25%", "w-[63%]"],
        ],
        hardRequirements: "5 年以上 · 复杂项目 · 技术决策",
        hardRequirementsLabel: "硬性门槛",
        scope: "筛选、复面与团队评审",
        scopeLabel: "使用范围",
        subtitle: "岗位标尺 · 第 3 版",
        title: "资深前端工程师",
        updated: "今天 10:24 更新",
        weights: "能力权重",
      },
    },
  },
} as const;

export function getHomeDemoCopy() {
  return HOME_DEMO_COPY[getLocale()];
}
