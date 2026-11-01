import type { DemoScreenCopy } from "./zh-cn";

export const koDemoScreenCopy: DemoScreenCopy = {
  agentState: {
    listening: "답변을 시작하세요...",
    speaking: "면접관이 말하는 중",
  },
  aiInterview: {
    aiInterviewer: "AI 면접관",
    candidateInfo: "후보자 정보",
    completed: "완료",
    contributionBody:
      "기획 주제·규칙 설계·회고를 맡아 3주 만에 신규 4,200명, 매장 사용률 27%를 달성했습니다.",
    contributionTitle: "‘주말 매장 체크인’ 캠페인에서의 개인 기여",
    conversationLabel: "대화",
    conversationQuestions: "대화 질문",
    conversationValue: "후보자 답변 12회",
    copyLink: "면접 링크 복사",
    endTime: "종료 시간",
    formAnswers: [
      {
        label: "경력",
        value: "3년",
      },
      {
        label: "희망 연봉",
        value: "월 ¥18,000–20,000",
      },
      {
        label: "입사 가능 시기",
        value: "오퍼 확정 후 2주 이내",
      },
    ],
    formQuestions: "양식 질문",
    hideTranscript: "대화 기록 접기",
    itemCount: (count: number) => `${count}개`,
    recommendBadge: "추천",
    resultMarkdown:
      "**대면 면접 진행을 권장합니다.** 신지는 ‘주말 매장 체크인’ 캠페인의 기획·실행·회고와 커뮤니티 악성 여론 대응 절차를 명확하게 설명했습니다. 개인 기여가 구체적이며, 월간 활성 비율이 18%에서 36%로 올랐고 3개월 연속 데이터로 뒷받침됩니다. 대면 면접에서는 부서 간 협업과 예산 관리를 중점적으로 확인합니다.",
    resultTitle: "면접 결과",
    roundButton: "1차 · AI 첫 면접 · 10/08 11:00",
    scoreLabel: "점수",
    showTranscript: "대화 기록 보기",
    startTime: "시작 시간",
    suggestionLabel: "제안",
    transcriptTitle: "면접 대화",
    viewQuestions: "추천 질문 보기",
  },
  autoplayCaption: "채용 절차 자동 데모",
  basicInfo: {
    creator: "등록자",
    email: "이메일",
    name: "이름",
    phone: "전화",
    relatedJob: "연결된 채용 공고",
    resumeAttachment: "PDF 이력서 첨부",
    resumeFile: "이력서 파일",
    targetRole: "희망 직무",
  },
  conversation: [
    {
      answer:
        "스광 라이프에서 40개 이상의 도시별 사용자 그룹을 맡아 신규 가입 SOP와 KOC 등급별 인센티브를 만들었습니다. ‘주말 매장 체크인’은 기획부터 회고까지 직접 맡아 3주 만에 신규 4,200명, 매장 사용률 27%를 달성했습니다.",
      question: "직접 맡았던 커뮤니티 성장 프로젝트와 본인이 담당한 부분을 소개해 주세요.",
    },
    {
      answer:
        "먼저 그룹에 통일된 답변과 처리 기한을 공지해 감정이 번지지 않게 합니다. 동시에 고객지원과 사업 담당자로 임시 대응 그룹을 만들어 30분 안에 해결책을 냅니다. 이후 대표적인 문제는 FAQ와 공지에 정리하고 매달 불만 비율을 회고합니다.",
      question: "그룹에 불만이나 부정적 여론이 몰리면 어떻게 대응하나요?",
    },
    {
      answer:
        "기준은 ‘해당 월에 그룹에서 발언하거나 이벤트에 참여한 멤버 비율’이며 봇과 직원 계정은 제외했습니다. 운영 활동을 하지 않은 대조 그룹과 비교해 할인 시즌의 자연 증가를 걸러냈고, 3개월 연속 33% 이상을 유지했습니다.",
      question: "월간 활성 비율이 18%에서 36%로 올랐습니다. 데이터가 유효한지 어떻게 확인했나요?",
    },
  ],
  desk: {
    clearFilters: "필터 지우기",
    close: "닫기",
    countLabel: (count: number) => `${count}명`,
    dateGroups: { earlier: "10월 4일", today: "오늘", yesterday: "어제" },
    empty: "현재 조건에 맞는 후보자가 없습니다",
    highlyRecommended: "적극 추천",
    refreshed: "후보자 목록을 새로 고쳤습니다",
    resumeCount: (count: number) => `이력서 ${count}건`,
  },
  deskRecords: {
    "00001": {
      detail: "최종 면접 · 평가 대기",
      education: [
        {
          period: "2018–2022",
          primary: "난징대학교",
          secondary: "중어중문학 · 학사",
        },
      ],
      focus: [
        {
          content: "콘텐츠 운영 3년, 장문 글과 숏폼 영상 기획에 강하고 꾸준히 제작합니다.",
          kind: "matching" as const,
          point: "콘텐츠 기획",
        },
        {
          content: "조회·완독·전환 데이터를 매주 회고해 기획에 반영합니다.",
          kind: "matching" as const,
          point: "데이터 회고",
        },
        {
          content: "지원 동기 서술이 적어 최종 면접에서 협업 의지를 확인해야 합니다.",
          kind: "risk" as const,
          point: "주도적 소통",
        },
      ],
      job: "윈판테크 / 콘텐츠 운영",
      name: "아야나미 레이",
      stage: "대면 면접",
      summary:
        "콘텐츠 운영 3년, 장문 글과 숏폼 영상 기획에 강함. 실행은 안정적이나 지원 동기 서술이 적음.",
      verdict: "추천",
      work: [
        {
          period: "2022–현재",
          primary: "지싱 아카데미",
          secondary: "콘텐츠 운영",
        },
        {
          period: "2021–2022",
          primary: "칭허출판사 뉴미디어팀",
          secondary: "편집 인턴",
        },
      ],
    },
    "00002": {
      detail: "2차 면접 · 일정 확정",
      education: [
        {
          period: "2016–2020",
          primary: "푸단대학교",
          secondary: "마케팅 · 학사",
        },
      ],
      focus: [
        {
          content: "한 번에 1.2만 명이 참여한 온라인 챌린지를 주도했습니다.",
          kind: "matching" as const,
          point: "이벤트 기획",
        },
        {
          content: "해외 중국어 사용자 커뮤니티를 운영해 여러 시간대 운영에 익숙합니다.",
          kind: "matching" as const,
          point: "해외 커뮤니티",
        },
        {
          content: "혼자 추진하는 편이라 부서 간 협업 방식을 2차 면접에서 확인해야 합니다.",
          kind: "risk" as const,
          point: "협업",
        },
      ],
      job: "윈판테크 / 시니어 커뮤니티 운영",
      name: "소류 아스카 랑그레이",
      stage: "대면 면접",
      summary: "커뮤니티·이벤트 운영 5년. 커뮤니티를 처음부터 구축하는 데 강하고 기획력이 뛰어남.",
      verdict: "추천",
      work: [
        {
          period: "2022–현재",
          primary: "하이청 셀렉트",
          secondary: "커뮤니티 운영 리더",
        },
        {
          period: "2020–2022",
          primary: "치밍 에듀케이션",
          secondary: "이벤트 운영",
        },
      ],
    },
    "00004": {
      detail: "미처리",
      education: [
        {
          period: "2020–2024",
          primary: "광저우체육대학",
          secondary: "스포츠경제경영 · 학사",
        },
      ],
      focus: [
        {
          content: "교내 동아리 행사 운영 경험이 많고 사용자와의 소통에 능합니다.",
          kind: "matching" as const,
          point: "사용자 소통",
        },
        {
          content: "완결된 온라인 운영 프로젝트가 없고 데이터 분석 역량을 보완해야 합니다.",
          kind: "risk" as const,
          point: "운영 경험",
        },
        {
          content: "신입이므로 운영 직무에 대한 이해도를 확인해야 합니다.",
          kind: "risk" as const,
          point: "직무 이해",
        },
      ],
      job: "윈판테크 / 사용자 운영",
      name: "스즈하라 토우지",
      stage: "이력서 심사",
      summary: "신입. 교내 행사 운영 경험은 풍부하나 완결된 온라인 운영 실적은 아직 없음.",
      verdict: "보류",
      work: [
        {
          period: "2023–2024",
          primary: "질풍 스포츠",
          secondary: "매장 이벤트 인턴",
        },
        {
          period: "2021–2024",
          primary: "교내 농구 동아리",
          secondary: "회장",
        },
      ],
    },
    "00005": {
      detail: "합격",
      education: [
        {
          period: "2015–2019",
          primary: "에든버러대학교",
          secondary: "심리학 · 학사",
        },
      ],
      focus: [
        {
          content: "사용자 리서치와 심리학 배경으로 사용자 동기를 빠르게 파악합니다.",
          kind: "matching" as const,
          point: "사용자 인사이트",
        },
        {
          content: "최근 2년은 프리랜서로 일해 경력을 중점적으로 확인해야 합니다.",
          kind: "risk" as const,
          point: "경력 연속성",
        },
        {
          content: "장기 커리어 계획이 이력서에 없어 근속 의향을 확인해야 합니다.",
          kind: "risk" as const,
          point: "장기 의향",
        },
      ],
      job: "윈판테크 / 커뮤니티 운영",
      name: "나기사 카오루",
      stage: "이력서 심사",
      summary: "심리학 배경으로 사용자 인사이트에 강함. 최근 2년 프리랜서로 경력 연속성 확인 필요.",
      verdict: "보류",
      work: [
        {
          period: "2024–현재",
          primary: "프리랜서",
          secondary: "커뮤니티 컨설턴트",
        },
        {
          period: "2019–2024",
          primary: "에코 소셜",
          secondary: "사용자 리서처",
        },
      ],
    },
    "00006": {
      detail: "연봉 협상 중",
      education: [
        {
          period: "2014–2018",
          primary: "상하이외국어대학교",
          secondary: "영어 · 학사",
        },
      ],
      focus: [
        {
          content: "라이브 방송과 커뮤니티 연계 경험이 많아 돌발 상황 대응이 빠릅니다.",
          kind: "matching" as const,
          point: "순발력",
        },
        {
          content: "WeCom·샤오훙수·더우인 커뮤니티를 동시에 운영합니다.",
          kind: "matching" as const,
          point: "멀티 플랫폼",
        },
        {
          content: "승인 없이 쿠폰을 발급한 적이 있어 절차 준수 의식을 확인해야 합니다.",
          kind: "risk" as const,
          point: "절차 준수",
        },
      ],
      job: "윈판테크 / 프라이빗 트래픽 운영",
      name: "마키나미 마리 일러스트리어스",
      stage: "오퍼 협상",
      summary:
        "프라이빗 트래픽·라이브 방송 운영 6년, 멀티 플랫폼에 강함. 절차 준수 의식 확인 필요.",
      verdict: "추천",
      work: [
        {
          period: "2021–현재",
          primary: "무광 뷰티",
          secondary: "프라이빗 트래픽 운영 매니저",
        },
        {
          period: "2018–2021",
          primary: "스타캐스트 미디어",
          secondary: "라이브 방송 운영",
        },
      ],
    },
  },
  detail: {
    activityNote: "카츠라기 미사토 · 이력서를 등록하고 커뮤니티 운영 직무에 연결",
    activityTab: "활동 기록",
    aiEvaluationTab: "AI 평가",
    aiInterviewTab: "AI 첫 면접",
    backTo: (page: string) => `${page}(으)로 돌아가기`,
    candidateInfo: "후보자 정보",
    careerTab: "경력 요약",
    enterHuman: "대면 면접으로 이동",
    enterMeeting: "면접 회의 참여",
    enterOffer: "오퍼 협상으로 이동",
    humanInterviewTab: "대면 면접",
    launchAi: "AI 첫 면접 시작",
    markClosed: "종료로 표시",
    overviewSummary:
      "커뮤니티 운영 3년, 40개 이상의 도시별 그룹 담당. 월간 활성 비율을 18%에서 36%로 향상.",
    overviewTab: "개요",
    previewResume: "이력서 미리 보기",
    profileFields: {
      email: "이메일",
      name: "이름",
      phone: "전화",
      relatedJob: "연결된 채용 공고",
      targetRole: "희망 직무",
      workYears: "경력",
    },
    recentActivity: "최근 활동",
    refreshInfo: "정보 새로 고침",
    scheduleHuman: "대면 면접 일정 잡기",
    stages: {
      "ai-completed": "AI 첫 면접 · 완료",
      "human-completed": "대면 면접 · 합격",
      "human-live": "대면 면접 · 진행 중",
      "human-scheduled": "대면 면접 · 일정 확정",
      invited: "AI 첫 면접 · 시작됨",
      live: "AI 첫 면접 · 진행 중",
      offer: "오퍼 협상 · 발송됨",
      screening: "이력서 심사 · 합격",
    },
    tabsLabel: "후보자 상세",
    viewEvaluationDetails: "AI 평가 상세 보기",
    workYears: "3년",
  },
  dialog: {
    aiQuestions: "AI 면접 질문",
    close: "닫기",
    closeLabel: "데모 대화상자 닫기",
    experienceTab: "경력",
    generated: "생성됨 · 3문항",
    invitationLabel: "후보자 전용 면접 링크",
    invitationValidity: "유효 기간: 7일 · 1차 AI 첫 면접 시작됨",
    overviewTab: "이력서 개요",
    questionKinds: ["프로젝트 경험", "여론 대응", "데이터 회고"],
    questionLabel: (index: number, kind: string) => `질문 ${index} · ${kind}`,
    questionsTab: "면접 질문",
    resumeDetails: "이력서 상세",
    saveSchedule: "일정 저장",
    scheduleFields: {
      candidate: "후보자",
      end: "종료 시간",
      format: "면접 방식",
      formatValue: "화상 면접",
      interviewer: "면접관",
      name: "면접 이름",
      start: "시작 시간",
    },
    scheduleFocusBody:
      "AI 1차 면접에서 확인한 프로젝트 근거를 바탕으로 이벤트 기획, 여론 대응, 데이터 기준을 검증합니다. 후보자와 면접관 모두 이 일정을 확인했습니다.",
    scheduleFocusTitle: "면접 중점",
    structuredResume: "구조화된 이력서",
    viewCandidatePage: "후보자 면접 페이지 보기",
  },
  evaluation: {
    conciseOverall:
      "신지는 로컬 서비스 커뮤니티 운영 3년 경력으로 40개 이상의 도시별 그룹을 단독으로 맡았고, 신규 유입·활성화·회고 모두 정량적 성과가 있습니다. 커뮤니티 운영 직무와 적합도가 높아 면접 진행을 권장합니다.",
    dimensions: {
      educationBackground:
        "화둥사범대학교 신문방송학 학사로, 콘텐츠 기획과 사용자 소통의 기반을 갖춰 직무 요건에 부합합니다.",
      experienceRelevance:
        "커뮤니티·프라이빗 트래픽 운영 3년으로 유입·활성화·이벤트·여론 대응을 모두 다뤄 직무와 직접 관련됩니다.",
      potential:
        "운영 어시스턴트에서 도시 커뮤니티 책임자로 성장했고 SOP와 인센티브 체계를 스스로 만들어 성장 잠재력이 큽니다.",
      projectMatch:
        "‘주말 매장 체크인’ 등 여러 캠페인을 기획부터 회고까지 주도해 이벤트 운영 요건에 부합합니다.",
      skillMatch:
        "WeCom SCRM, 설문, 대시보드를 능숙하게 다루며 세그먼트 운영과 캠페인 데이터 회고를 혼자 수행합니다.",
      stability:
        "두 회사에서 각각 2년, 3년 근무했고 퇴사 사유가 명확해 전반적인 안정성이 좋습니다.",
    },
    judgment:
      "**강력 추천.** 커뮤니티 구축, 이벤트 기획, 데이터 회고 경험이 커뮤니티 운영 직무와 높게 일치하며 도시별 커뮤니티를 단독으로 맡을 수 있습니다.",
    matchingEvidence: [
      {
        content: "이벤트 기획부터 실행까지의 기록이 있고 성과가 정량화되어 있습니다.",
        jobRequirement: "커뮤니티 이벤트를 단독으로 기획·실행한 경험",
        point: "이벤트 기획",
        resumeEvidence: "‘주말 매장 체크인’ 주도, 3주 만에 신규 4,200명, 매장 사용률 27%",
      },
      {
        content: "활성도 향상이 정량적으로 기록되어 활성화 요건을 충족합니다.",
        jobRequirement: "커뮤니티 활성도와 유지율을 꾸준히 높일 수 있음",
        point: "커뮤니티 활성화",
        resumeEvidence: "월간 활성 비율 18%→36%, 3개월 연속 33% 이상 유지",
      },
      {
        content: "운영 규모가 요건을 충족하고 세그먼트 운영 경험이 있습니다.",
        jobRequirement: "1만 명 이상 커뮤니티 운영 경험",
        point: "커뮤니티 규모",
        resumeEvidence: "40개 이상의 도시별 그룹, 누적 멤버 2.6만 명 담당",
      },
    ],
    risks: [
      {
        content:
          "제품·고객지원 팀과의 협업 방식이 이력서에 없고 프로젝트도 대부분 단독 추진이라 대면 면접에서 중점 확인이 필요합니다.",
        jobRequirement: "제품·고객지원 등 다른 팀과 함께 추진할 수 있음",
        point: "부서 간 협업",
        resumeEvidence: null,
      },
    ],
    seniorityLevel: "커뮤니티 운영(중급)",
    seniorityRationale: "도시별 커뮤니티를 단독으로 맡고 그로스 팀의 캠페인을 지원할 수 있습니다.",
    teamRationale:
      "핵심 도시 사용자 그룹과 커뮤니티 이벤트를 맡아 콘텐츠·그로스 팀과 협업하기에 적합합니다.",
    teamSuggestion: "커뮤니티 운영 / 도시 커뮤니티 책임자",
  },
  evaluationUi: {
    basis: {
      both: "직무 요건과 일반 직업 기준에 따른 분석",
      general: "일반 직업 기준에 따른 분석",
      job: "직무 요건에 따른 분석",
    },
    dimensionLabels: {
      educationBackground: "학력·배경",
      experienceRelevance: "경력 관련성",
      potential: "잠재력",
      projectMatch: "프로젝트 적합도",
      skillMatch: "기술 적합도",
      stability: "안정성",
    },
    dimensionsTitle: "6차원 평가",
    jobRequirement: "직무 요건",
    judgment: "판단",
    levels: {
      highly_recommended: "적극 추천",
      recommended: "추천",
    },
    matchingEvidence: "적합 근거",
    notMentioned: "이력서에 언급 없음",
    overallTitle: "종합 평가",
    radarLabel: "이력서 6차원 정성 평가 레이더 차트",
    recommendation: "추천 의견",
    resumeEvidence: "이력서 근거",
    risks: "리스크 및 확인 사항",
    seniority: "직급 제안",
    team: "팀 내 역할",
  },
  humanEvaluation: {
    detailedAnalysis:
      "이벤트 기획: 목표·예산·회고 지표를 명확히 설명하고 판단에 근거가 있습니다.\n데이터 기준: 월간 활성 기준과 대조군 설계를 설명하며 할인 시즌 등의 영향을 배제했습니다.\n협업 소통: 고객지원·사업 담당자와의 협업 절차가 명확하고 문제를 끝까지 해결합니다.",
    overallEvaluation:
      "**업무 면접 통과를 권장합니다.** 신지는 커뮤니티 이벤트의 기획과 회고, 여론 대응 절차를 명확히 설명했고 데이터 기준 검증 방법도 신뢰할 수 있습니다. 커뮤니티 운영 직무에 적합합니다.",
    professionalSkill: "우수",
    rating: "A",
    risks:
      "부서 간 추진 시 신중한 편이라 리소스 조율에 상사의 도움이 필요합니다. 대형 이벤트 예산 관리 경험은 제한적입니다.",
    rolePosition: "커뮤니티 운영 / 도시 커뮤니티 책임자",
    salaryRecommendation: "월 ¥18,000–20,000, 분기 성과급 별도",
    strengths:
      "이벤트를 완결된 흐름으로 운영함, 데이터 기준이 명확함, 대시보드로 전략을 조정함, 사용자 응대가 세심함.",
  },
  humanInterview: {
    focusItems: [
      "‘주말 매장 체크인’의 목표와 예산은 어떻게 정했나요?",
      "불만이 몰릴 때 고객지원과 어떻게 협업하나요?",
      "활성화 활동이 월간 활성에 준 실제 효과를 어떻게 검증하나요?",
    ],
    focusNote: "AI 1차 면접에서 확인한 프로젝트 근거를 참고해 핵심 결정을 깊이 확인합니다.",
    focusTitle: "이번 면접 중점",
    history: "지난 면접",
    pending: "처리 대기",
    progressDescription: "면접 일정, 차수별 결과, 면접 평가 확인",
    progressTitle: "대면 면접 진행 상황",
    roundLabel: "업무 면접",
    schedule: "면접 일정 잡기",
  },
  job: {
    label: "윈판테크 / 커뮤니티 운영",
    title: "커뮤니티 운영",
  },
  liveInterview: {
    camera: "카메라",
    deviceSettings: (device: string) => `${device} 설정`,
    endInterview: "면접 종료",
    microphone: "마이크",
    roundLabel: "AI 첫 면접",
    transcript: "대화 기록",
  },
  meetingInfo: {
    job: "채용 공고",
    responsibleHr: "담당 HR",
    round: "면접 차수",
    time: "회의 시간",
    timeValue: "2026년 10월 9일 14:00",
    title: "회의 정보",
  },
  offer: {
    copyLink: "오퍼 링크 복사",
    edit: "편집",
    expectations: [
      {
        label: "희망 월급",
        value: "¥ 20,000",
      },
      {
        label: "현재 월급",
        value: "¥ 16,000",
      },
      {
        label: "정규 전환 후 급여",
        value: "¥ 19,000",
      },
      {
        label: "수습 기간 급여",
        value: "¥ 19,000",
      },
      {
        label: "최초 입사 가능일",
        value: "2026/11/02",
      },
      {
        label: "비고",
        value: "업무 면접 통과, 처우 합의 완료",
      },
    ],
    expectationsNote: "오퍼 발송 전에 후보자의 기대 조건을 모아 협상에 참고합니다.",
    expectationsTitle: "후보자 기대 조건",
    fields: [
      {
        label: "직위",
        value: "커뮤니티 운영(중급)",
      },
      {
        label: "기본 월급",
        value: "¥ 19,000",
      },
      {
        label: "연간 보너스",
        value: "¥ 38,000",
      },
      {
        label: "복리후생",
        value: "보충 의료보험 및 연간 건강검진",
      },
      {
        label: "입사 예정일",
        value: "2026/11/02",
      },
      {
        label: "오퍼 유효 기한",
        value: "2026/10/16",
      },
      {
        label: "메일 상태",
        value: "shinji@example.com으로 발송 · 10/10 10:05",
      },
    ],
    notes:
      "업무 면접을 통과했고 처우는 사용자 그로스팀 책임자와 확인했습니다. 수습 3개월, 급여 100% 지급.",
    notesLabel: "비고",
    progress: {
      current: (label: string) => `현재: ${label}`,
      label: "오퍼 협상 진행 상황",
      step: (index: number, total: number) => `${total}단계 중 ${index}단계`,
      steps: ["급여 내역", "연봉 협상", "오퍼 발송", "평판 조회"],
      task: "현재 단계: 오퍼가 게시되어 후보자 확인을 기다리는 중이며, 수락 후 평판 조회로 진행합니다.",
    },
    reEvaluate: "다시 평가",
    recordResponse: "후보자 응답 기록",
    sent: "발송됨",
    title: "오퍼 · 1차 버전",
  },
  people: {
    candidate: "이카리 신지",
    interviewer: "아카기 리츠코",
    recruiter: "카츠라기 미사토",
  },
  resume: {
    education: [
      {
        period: "2017–2021",
        primary: "화둥사범대학교",
        secondary: "신문방송학 · 학사",
      },
    ],
    educationTitle: "학력",
    fileName: "이카리_신지_커뮤니티_운영.pdf",
    previewSubtitle: "3년 · 커뮤니티 구축 · 이벤트 기획 · 데이터 회고",
    skills: ["세그먼트 운영", "이벤트 기획", "WeCom SCRM", "데이터 회고"],
    skillsTitle: "기술",
    summary:
      "커뮤니티 운영 3년, 도시별 커뮤니티를 단독으로 담당. 유입과 활성화 성과가 직무 핵심 요건과 높게 일치합니다.",
    work: [
      {
        period: "2023–현재",
        primary: "스광 라이프",
        secondary: "커뮤니티 운영",
        summary:
          "40개 이상의 도시별 그룹의 유입과 활성화를 맡고 ‘주말 매장 체크인’ 등 캠페인을 주도했습니다.",
      },
      {
        period: "2021–2023",
        primary: "차위 티",
        secondary: "프라이빗 트래픽 운영 어시스턴트",
        summary: "매장 WeCom 그룹 구축을 돕고 일일 콘텐츠 일정과 프로모션을 운영했습니다.",
      },
    ],
    workTitle: "경력",
  },
  room: {
    aiEvaluation: "AI 평가",
    camera: "카메라 꺼짐",
    candidateInfo: "후보자 정보",
    candidateOverview: "후보자 개요",
    candidateRole: "후보자",
    chat: "채팅",
    closeQuestions: "면접 질문 닫기",
    closeReview: "평가 닫기",
    endMeeting: "회의 종료",
    evaluationDetails: "평가 상세",
    fullscreenResume: "이력서 전체 화면 보기",
    history: [
      {
        label: "지원 동기",
        value: "더 큰 무대에서 커뮤니티 성장의 전 과정을 맡고 싶습니다.",
      },
      {
        label: "현재 상태와 입사 시기",
        value: "재직 중이며 오퍼 확정 후 2주 이내 입사 가능합니다.",
      },
      {
        label: "보상 현황과 기대",
        value: "현재 월 ¥16,000, 희망 ¥18,000–20,000.",
      },
      {
        label: "성과·인상·승진",
        value: "작년 평가 A, 운영 어시스턴트에서 도시 커뮤니티 책임자로 승진.",
      },
      {
        label: "최근 경력",
        value: "스광 라이프 커뮤니티 운영으로 도시별 그룹의 유입·활성화·여론 대응을 담당.",
      },
      {
        label: "대표 프로젝트",
        value:
          "‘주말 매장 체크인’으로 3주 만에 신규 4,200명, 월간 활성 비율 18%→36%를 3개월간 검증.",
      },
    ],
    historyRoundLabel: "AI 첫 면접 · 86점 · 대면 면접 추천",
    hostRole: "호스트",
    hrInitial: "HR 첫 면접",
    meetingView: "회의 보기",
    microphone: "마이크",
    participants: "참석 인원",
    questions: "면접 질문",
    recording: "녹화 중",
    referenceNote:
      "AI 1차 면접에서 확인한 답변을 바탕으로 프로젝트 세부 사항과 판단 근거를 계속 확인합니다.",
    referenceQuestion: (index: number) => `참고 질문 ${index}`,
    review: "평가",
    reviewDescription: "입력 내용은 매초 자동 저장되며, 회의 후 보완해 제출합니다.",
    reviewFields: {
      conclusion: "나의 결론",
      overall: "종합 평가",
      professionalSkill: "전문 역량",
      rating: "등급",
      risks: "약점·리스크",
      rolePosition: "역할 포지션",
      salary: "연봉 제안",
      strengths: "강점",
    },
    reviewTitle: "면접 평가",
    self: " (나)",
    shareScreen: "화면 공유",
    submitReview: "평가 제출",
    subtitles: "자막",
    timeline: "평가 타임라인",
    toggleTheme: "테마 전환",
  },
  round: {
    attendance: "참석 현황",
    detailedAnalysis: "상세 분석",
    evaluationStatus: "평가 · 제출됨",
    evaluationTitle: "면접 평가",
    format: "온라인 면접",
    hideDetails: "상세 분석 접기",
    interviewer: "면접관",
    outcomePass: "합격",
    scheduledAt: "10월 9일 14:00 – 15:00",
    showDetails: "상세 분석 펼치기",
    status: "상태",
    statusCompleted: "완료",
    statusScheduled: "면접 예정",
    title: (index: number, label: string) => `${index}차 · ${label}`,
  },
  shell: {
    themeToggle: "데모 테마 전환",
    workbench: "데모 워크스페이스",
  },
  stages: {
    aiCompleted: "완료 · 86점",
    aiInterview: "AI 면접",
    humanInterview: "대면 면접",
    humanPassed: "완료 · 합격",
    inProgress: "진행 중",
    invited: "시작됨",
    offer: "오퍼 협상",
    offerSent: "발송됨",
    qualified: "합격",
    scheduled: "일정 확정",
    screening: "이력서 심사",
  },
  tour: {
    aiResult: "AI 첫 면접 86점, 대면 면접 추천",
    aiTranscript: "평가에서 대화로 돌아가 답변 근거 확인",
    backToMaterials: "회의 자료 보기로 돌아가기",
    backToMeeting: "후보자 맥락을 유지한 채 화상 회의로 복귀",
    candidate: "이카리 신지 · 커뮤니티 운영, 전체 프로필 보기",
    detailBack: "채용 데스크로 돌아오면 같은 기록이 오퍼 협상 단계에 있음",
    enterInterview: "후보자가 전용 링크로 음성 면접에 참여",
    enterRoom: "신지의 업무 면접에 참여",
    evaluation: "이력서 평가: 적극 추천, 6차원 근거 확인 가능",
    finishAi: "AI 첫 면접 완료, 이카리 신지의 결과로 복귀",
    finishHuman: "재면접 완료, 이카리 신지의 기록과 평가로 복귀",
    humanAnalysis: "평가 A, 전문 역량 우수, 도시 커뮤니티 책임자로 추천",
    humanResult: "업무 면접 A 등급, 통과",
    humanSchedule: "같은 기록에서 대면 면접 일정 확인",
    initialInfo: "1차 면접에서 수집한 프로젝트·연봉·입사 시기 확인",
    launch: "같은 후보자의 AI 첫 면접 시작",
    resumeEvaluation: "AI 이력서 평가로 적합 근거와 리스크 확인",
    resumeFullscreen: "이력서를 확대해 같은 후보자의 프로젝트 경력 확인",
    roomMaterials: "회의를 떠나지 않고 후보자 자료 확인",
    roomQuestions: "참고 질문을 펼쳐 근거를 바탕으로 추가 질문",
    roomReview: "회의 안에서 면접관 평가표 열기",
    scheduleConfirmed: "면접 일정과 면접관 확정",
    transitionHuman: "신지를 대면 면접으로 넘기고 업무 면접 일정 잡기",
    transitionOffer: "대면 면접 합격, 같은 후보자의 오퍼 협상으로",
    turnOne: "AI가 캠페인을 계속 질문해 구체적인 기여를 기록",
    turnTwo: "월간 활성 기준을 추가로 묻고 원래 답변과 근거를 보존",
  },
};
