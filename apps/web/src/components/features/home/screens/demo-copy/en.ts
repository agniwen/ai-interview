import type { DemoScreenCopy } from "./zh-cn";

export const enDemoScreenCopy: DemoScreenCopy = {
  agentState: {
    listening: "Your turn to answer...",
    speaking: "Interviewer is speaking",
  },
  aiInterview: {
    aiInterviewer: "AI interviewer",
    candidateInfo: "Candidate info",
    completed: "Completed",
    contributionBody:
      "Owned topic selection, rules, and the retro for the campaign: 4,200 new members in 3 weeks and a 27% in-store redemption rate.",
    contributionTitle: "Personal contribution to the “Weekend Check-in” campaign",
    conversationLabel: "Conversation",
    conversationQuestions: "Conversation questions",
    conversationValue: "12 candidate replies",
    copyLink: "Copy interview link",
    endTime: "End time",
    formAnswers: [
      {
        label: "Experience",
        value: "3 years",
      },
      {
        label: "Expected salary",
        value: "¥18,000–20,000 / month",
      },
      {
        label: "Availability",
        value: "Can start within two weeks of the offer",
      },
    ],
    formQuestions: "Form questions",
    hideTranscript: "Hide transcript",
    itemCount: (count: number) => `${count} items`,
    recommendBadge: "Recommended",
    resultMarkdown:
      "**Advance to a live interview.** Shinji clearly walked through planning, running, and reviewing the “Weekend Check-in” campaign, and how he handles community backlash. His contribution is specific: monthly active members rose from 18% to 36%, backed by three consecutive months of data. The live round should probe cross-team collaboration and budget ownership.",
    resultTitle: "Interview result",
    roundButton: "Round 1 · AI screening · 10/08 11:00",
    scoreLabel: "Score",
    showTranscript: "View transcript",
    startTime: "Start time",
    suggestionLabel: "Suggestion",
    transcriptTitle: "Interview conversation",
    viewQuestions: "View suggested questions",
  },
  autoplayCaption: "Automated hiring workflow demo",
  basicInfo: {
    creator: "Created by",
    email: "Email",
    name: "Name",
    phone: "Phone",
    relatedJob: "Linked job",
    resumeAttachment: "PDF resume attachment",
    resumeFile: "Resume file",
    targetRole: "Target role",
  },
  conversation: [
    {
      answer:
        "I run 40+ city groups at Shiguang Life and built the newcomer onboarding SOP and a tiered KOC incentive. I owned the “Weekend Check-in” campaign end to end: 4,200 new members in 3 weeks and a 27% in-store redemption rate.",
      question:
        "Walk me through a community growth project you ran and the part you personally owned.",
    },
    {
      answer:
        "First I post one unified reply in the group with a clear response time so frustration doesn't spread. In parallel I pull support and the business owner into a war room and get a fix out within 30 minutes. Afterwards the common issues go into the FAQ and group notice, and I review complaint rates monthly.",
      question:
        "When a wave of complaints or negative sentiment hits a group, how do you handle it?",
    },
    {
      answer:
        "The metric is the share of members who posted or joined an activity that month, excluding bots and staff accounts. I compared against control groups with no campaign to rule out sale-season lift, and it held above 33% for three straight months.",
      question:
        "Monthly active members rose from 18% to 36%. How did you confirm the data is valid?",
    },
  ],
  desk: {
    clearFilters: "Clear filters",
    close: "Close",
    countLabel: (count: number) => `${count} people`,
    dateGroups: { earlier: "Oct 4", today: "Today", yesterday: "Yesterday" },
    empty: "No candidates match these filters",
    highlyRecommended: "Highly recommended",
    refreshed: "Candidate list refreshed",
    resumeCount: (count: number) => `${count} resumes`,
  },
  deskRecords: {
    "00001": {
      detail: "Final · Awaiting review",
      education: [
        {
          period: "2018–2022",
          primary: "Nanjing University",
          secondary: "Chinese Literature · BA",
        },
      ],
      focus: [
        {
          content:
            "3 years in content operations; strong at long-form and short-video topics with steady output.",
          kind: "matching" as const,
          point: "Content planning",
        },
        {
          content:
            "Reviews reads, completion, and conversion weekly and adjusts topics accordingly.",
          kind: "matching" as const,
          point: "Data review",
        },
        {
          content:
            "The resume says little about motivation; confirm communication and teamwork in the final round.",
          kind: "risk" as const,
          point: "Proactive communication",
        },
      ],
      job: "Yunfan Tech / Content Operations",
      name: "Rei Ayanami",
      stage: "Live interview",
      summary:
        "3 years in content operations, strong at long-form and short-video topics; steady execution, little on motivation.",
      verdict: "Recommended",
      work: [
        {
          period: "2022–now",
          primary: "Zhixing Academy",
          secondary: "Content Operations",
        },
        {
          period: "2021–2022",
          primary: "Qinghe Press, New Media",
          secondary: "Editorial Intern",
        },
      ],
    },
    "00002": {
      detail: "Second round · Scheduled",
      education: [
        {
          period: "2016–2020",
          primary: "Fudan University",
          secondary: "Marketing · BA",
        },
      ],
      focus: [
        {
          content: "Led an online challenge with 12,000 participants in a single run.",
          kind: "matching" as const,
          point: "Campaign planning",
        },
        {
          content: "Ran overseas Chinese user communities across multiple time zones.",
          kind: "matching" as const,
          point: "Overseas communities",
        },
        {
          content:
            "Tends to drive projects alone; verify how she works across teams in the second round.",
          kind: "risk" as const,
          point: "Collaboration",
        },
      ],
      job: "Yunfan Tech / Senior Community Operations",
      name: "Asuka Langley Soryu",
      stage: "Live interview",
      summary:
        "5 years in community and campaign operations; builds communities from zero with strong campaign planning.",
      verdict: "Recommended",
      work: [
        {
          period: "2022–now",
          primary: "Haicheng Select",
          secondary: "Community Operations Lead",
        },
        {
          period: "2020–2022",
          primary: "Qiming Education",
          secondary: "Campaign Operations",
        },
      ],
    },
    "00004": {
      detail: "Pending",
      education: [
        {
          period: "2020–2024",
          primary: "Guangzhou Sport University",
          secondary: "Sports Economics · BA",
        },
      ],
      focus: [
        {
          content: "Extensive campus club experience running offline events and talking to users.",
          kind: "matching" as const,
          point: "User communication",
        },
        {
          content: "No complete online operations project yet; data analysis needs work.",
          kind: "risk" as const,
          point: "Operations experience",
        },
        {
          content: "New graduate; confirm his understanding of the operations role.",
          kind: "risk" as const,
          point: "Role understanding",
        },
      ],
      job: "Yunfan Tech / User Operations",
      name: "Toji Suzuhara",
      stage: "Screening",
      summary:
        "New graduate with rich campus event experience; no complete online operations project yet.",
      verdict: "Undecided",
      work: [
        {
          period: "2023–2024",
          primary: "Gale Sports",
          secondary: "Store Events Intern",
        },
        {
          period: "2021–2024",
          primary: "University Basketball Club",
          secondary: "President",
        },
      ],
    },
    "00005": {
      detail: "Qualified",
      education: [
        {
          period: "2015–2019",
          primary: "University of Edinburgh",
          secondary: "Psychology · BSc",
        },
      ],
      focus: [
        {
          content: "User research and psychology background; quickly understands user motivation.",
          kind: "matching" as const,
          point: "User insight",
        },
        {
          content: "Freelance for the past two years; verify the work history.",
          kind: "risk" as const,
          point: "Career continuity",
        },
        {
          content: "No long-term career plan in the resume; confirm stability.",
          kind: "risk" as const,
          point: "Long-term intent",
        },
      ],
      job: "Yunfan Tech / Community Operations",
      name: "Kaworu Nagisa",
      stage: "Screening",
      summary:
        "Psychology background with strong user insight; freelance for two years, so continuity needs checking.",
      verdict: "Undecided",
      work: [
        {
          period: "2024–now",
          primary: "Freelance",
          secondary: "Community Consultant",
        },
        {
          period: "2019–2024",
          primary: "Echo Social",
          secondary: "User Researcher",
        },
      ],
    },
    "00006": {
      detail: "Negotiating",
      education: [
        {
          period: "2014–2018",
          primary: "Shanghai International Studies University",
          secondary: "English · BA",
        },
      ],
      focus: [
        {
          content: "Deep experience linking livestreams with communities; handles incidents fast.",
          kind: "matching" as const,
          point: "Quick thinking",
        },
        {
          content: "Runs WeCom, Xiaohongshu, and Douyin communities at the same time.",
          kind: "matching" as const,
          point: "Multi-platform",
        },
        {
          content: "Once issued coupons without approval; confirm her process discipline.",
          kind: "risk" as const,
          point: "Process compliance",
        },
      ],
      job: "Yunfan Tech / Private Traffic Operations",
      name: "Mari Illustrious Makinami",
      stage: "Offer negotiation",
      summary:
        "6 years in private-traffic and livestream operations, strong across platforms; confirm process discipline.",
      verdict: "Recommended",
      work: [
        {
          period: "2021–now",
          primary: "Muguang Beauty",
          secondary: "Private Traffic Lead",
        },
        {
          period: "2018–2021",
          primary: "Starcast Media",
          secondary: "Livestream Operations",
        },
      ],
    },
  },
  detail: {
    activityNote: "Misato Katsuragi · Added resume and linked it to Community Operations",
    activityTab: "Activity",
    aiEvaluationTab: "AI evaluation",
    aiInterviewTab: "AI screening",
    backTo: (page: string) => `Back to ${page}`,
    candidateInfo: "Candidate info",
    careerTab: "Career summary",
    enterHuman: "Move to live interview",
    enterMeeting: "Join interview meeting",
    enterOffer: "Move to offer negotiation",
    humanInterviewTab: "Live interview",
    launchAi: "Start AI screening",
    markClosed: "Mark as closed",
    overviewSummary:
      "3 years in community operations running 40+ city groups; monthly active members up from 18% to 36%.",
    overviewTab: "Overview",
    previewResume: "Preview resume",
    profileFields: {
      email: "Email",
      name: "Name",
      phone: "Phone",
      relatedJob: "Linked open role",
      targetRole: "Desired role",
      workYears: "Experience",
    },
    recentActivity: "Recent activity",
    refreshInfo: "Refresh",
    scheduleHuman: "Schedule live interview",
    stages: {
      "ai-completed": "AI screening · Completed",
      "human-completed": "Live interview · Passed",
      "human-live": "Live interview · In progress",
      "human-scheduled": "Live interview · Scheduled",
      invited: "AI screening · Started",
      live: "AI screening · In progress",
      offer: "Offer negotiation · Sent",
      screening: "Screening · Qualified",
    },
    tabsLabel: "Candidate details",
    viewEvaluationDetails: "View AI evaluation",
    workYears: "3 years",
  },
  dialog: {
    aiQuestions: "AI interview questions",
    close: "Close",
    closeLabel: "Close demo dialog",
    experienceTab: "Experience",
    generated: "Generated · 3 questions",
    invitationLabel: "Candidate's private interview link",
    invitationValidity: "Valid for 7 days · Round 1 AI screening started",
    overviewTab: "Resume overview",
    questionKinds: ["Project record", "Backlash handling", "Data review"],
    questionLabel: (index: number, kind: string) => `Question ${index} · ${kind}`,
    questionsTab: "Interview questions",
    resumeDetails: "Resume details",
    saveSchedule: "Save schedule",
    scheduleFields: {
      candidate: "Candidate",
      end: "End time",
      format: "Format",
      formatValue: "Video interview",
      interviewer: "Interviewer",
      name: "Interview name",
      start: "Start time",
    },
    scheduleFocusBody:
      "Building on the project evidence confirmed in AI screening, verify campaign planning, backlash handling, and metric definitions. Both the candidate and the interviewer have confirmed this slot.",
    scheduleFocusTitle: "Interview focus",
    structuredResume: "Structured resume",
    viewCandidatePage: "View candidate interview page",
  },
  evaluation: {
    conciseOverall:
      "Shinji has 3 years of local-services community operations, independently running 40+ city groups with measurable results in acquisition, engagement, and retros. A strong fit for Community Operations. Advance to interview.",
    dimensions: {
      educationBackground:
        "BA in Journalism and Communication from East China Normal University, a solid base for content planning and user communication.",
      experienceRelevance:
        "3 years of community and private-traffic operations covering acquisition, engagement, campaigns, and backlash handling; directly relevant to the role.",
      potential:
        "Grew from operations assistant to city community lead and proactively built SOPs and incentive tiers; clear room to grow.",
      projectMatch:
        "Led campaigns such as “Weekend Check-in” end to end, from topic to retro, matching the role's campaign requirements.",
      skillMatch:
        "Fluent with WeCom SCRM, surveys, and dashboards; segments communities and reviews campaign data independently.",
      stability:
        "Two roles of 2 and 3 years with clear reasons for leaving; overall stability is good.",
    },
    judgment:
      "**Highly recommended.** Community building, campaign planning, and data review closely match the Community Operations role; he can own a city community portfolio.",
    matchingEvidence: [
      {
        content: "Complete campaign planning and delivery record with measurable results.",
        jobRequirement: "Has planned and delivered community campaigns independently",
        point: "Campaign planning",
        resumeEvidence:
          "Led “Weekend Check-in”: 4,200 new members in 3 weeks, 27% in-store redemption",
      },
      {
        content: "Measured engagement gains meet the role's requirement.",
        jobRequirement: "Can keep raising community engagement and retention",
        point: "Engagement",
        resumeEvidence:
          "Monthly active members up from 18% to 36%, above 33% for three straight months",
      },
      {
        content: "Community scale meets the requirement, with tiered operations experience.",
        jobRequirement: "Has managed communities of 10,000+ members",
        point: "Community scale",
        resumeEvidence: "Runs 40+ city groups with 26,000 members in total",
      },
    ],
    risks: [
      {
        content:
          "The resume doesn't say how he works with product and support, and most projects were run solo; verify in the live interview.",
        jobRequirement: "Can drive work together with product, support, and other teams",
        point: "Cross-team collaboration",
        resumeEvidence: null,
      },
    ],
    seniorityLevel: "Community Operations (mid-level)",
    seniorityRationale:
      "Can own a city community portfolio and support the growth team's campaigns.",
    teamRationale:
      "Suited to running core city groups and community campaigns alongside the content and growth teams.",
    teamSuggestion: "Community Operations / City community lead",
  },
  evaluationUi: {
    basis: {
      both: "Based on job requirements and general professional standards",
      general: "Based on general professional standards",
      job: "Based on job requirements",
    },
    dimensionLabels: {
      educationBackground: "Education",
      experienceRelevance: "Experience",
      potential: "Potential",
      projectMatch: "Projects",
      skillMatch: "Skills",
      stability: "Stability",
    },
    dimensionsTitle: "Six-dimension evaluation",
    jobRequirement: "Requirement",
    judgment: "Judgment",
    levels: {
      highly_recommended: "Highly recommended",
      recommended: "Recommended",
    },
    matchingEvidence: "Matching evidence",
    notMentioned: "Not mentioned in resume",
    overallTitle: "Overall evaluation",
    radarLabel: "Six-dimension qualitative resume radar",
    recommendation: "Recommendation",
    resumeEvidence: "Resume evidence",
    risks: "Risks and open questions",
    seniority: "Seniority",
    team: "Team fit",
  },
  humanEvaluation: {
    detailedAnalysis:
      "Campaign planning: states goals, budget, and retro metrics clearly, with reasoned trade-offs.\nMetric definitions: explains the monthly-active definition and control-group design, ruling out sale-season effects.\nCollaboration: has a clear process with support and business owners and closes issues out.",
    overallEvaluation:
      "**Pass the business review.** Shinji clearly explained how he plans and reviews community campaigns and handles backlash, and he validates his metrics reliably. A good fit for Community Operations.",
    professionalSkill: "Excellent",
    rating: "A",
    risks:
      "Cautious when pushing across teams and needs his manager to align resources; limited budget ownership on large campaigns.",
    rolePosition: "Community Operations / City community lead",
    salaryRecommendation: "¥18,000–20,000 per month plus quarterly performance bonus",
    strengths:
      "Campaigns run as a full loop; clear metric definitions; adjusts strategy from dashboards; patient with users.",
  },
  humanInterview: {
    focusItems: [
      "How did you set goals and budget for “Weekend Check-in”?",
      "When complaints spike, how do you work with support?",
      "How do you verify the real impact of engagement work on monthly actives?",
    ],
    focusNote: "Use the project evidence confirmed in AI screening to dig into key decisions.",
    focusTitle: "Focus for this round",
    history: "Past interviews",
    pending: "To do",
    progressDescription: "Review schedules, round results, and interview evaluations",
    progressTitle: "Live interview progress",
    roundLabel: "Business review",
    schedule: "Schedule interview",
  },
  job: {
    label: "Yunfan Tech / Community Operations",
    title: "Community Operations",
  },
  liveInterview: {
    camera: "Camera",
    deviceSettings: (device: string) => `${device} settings`,
    endInterview: "End interview",
    microphone: "Microphone",
    roundLabel: "AI screening",
    transcript: "Transcript",
  },
  meetingInfo: {
    job: "Open role",
    responsibleHr: "HR owner",
    round: "Round",
    time: "Meeting time",
    timeValue: "Oct 9, 2026, 14:00",
    title: "Meeting info",
  },
  offer: {
    copyLink: "Copy offer link",
    edit: "Edit",
    expectations: [
      {
        label: "Expected monthly pay",
        value: "¥ 20,000",
      },
      {
        label: "Current monthly pay",
        value: "¥ 16,000",
      },
      {
        label: "Post-probation pay",
        value: "¥ 19,000",
      },
      {
        label: "Probation pay",
        value: "¥ 19,000",
      },
      {
        label: "Earliest start",
        value: "2026/11/02",
      },
      {
        label: "Notes",
        value: "Passed the business review; package agreed",
      },
    ],
    expectationsNote: "Collect the candidate's expectations before sending an offer.",
    expectationsTitle: "Candidate expectations",
    fields: [
      {
        label: "Position",
        value: "Community Operations (mid-level)",
      },
      {
        label: "Base monthly pay",
        value: "¥ 19,000",
      },
      {
        label: "Annual bonus",
        value: "¥ 38,000",
      },
      {
        label: "Benefits",
        value: "Supplementary health insurance and annual checkup",
      },
      {
        label: "Expected start",
        value: "2026/11/02",
      },
      {
        label: "Offer valid until",
        value: "2026/10/16",
      },
      {
        label: "Email status",
        value: "Sent to shinji@example.com · 10/10 10:05",
      },
    ],
    notes:
      "Passed the business review; package confirmed with the User Growth lead. 3-month probation at 100% pay.",
    notesLabel: "Notes",
    progress: {
      current: (label: string) => `Current: ${label}`,
      label: "Offer negotiation progress",
      step: (index: number, total: number) => `Step ${index} of ${total}`,
      steps: ["Income records", "Salary talk", "Send offer", "Background check"],
      task: "Current stage: offer published, awaiting the candidate's confirmation; background check follows acceptance.",
    },
    reEvaluate: "Re-evaluate",
    recordResponse: "Record candidate response",
    sent: "Sent",
    title: "Offer · Version 1",
  },
  people: {
    candidate: "Shinji Ikari",
    interviewer: "Ritsuko Akagi",
    recruiter: "Misato Katsuragi",
  },
  resume: {
    education: [
      {
        period: "2017–2021",
        primary: "East China Normal University",
        secondary: "Journalism and Communication · BA",
      },
    ],
    educationTitle: "Education",
    fileName: "Shinji_Ikari_Community_Operations.pdf",
    previewSubtitle: "3 years · Community building · Campaign planning · Data review",
    skills: ["Tiered community ops", "Campaign planning", "WeCom SCRM", "Data review"],
    skillsTitle: "Skills",
    summary:
      "3 years in community operations, independently running a city community portfolio; acquisition and engagement results closely match the role.",
    work: [
      {
        period: "2023–now",
        primary: "Shiguang Life",
        secondary: "Community Operations",
        summary:
          "Drives acquisition and engagement for 40+ city groups and led campaigns such as “Weekend Check-in”.",
      },
      {
        period: "2021–2023",
        primary: "Chayu Tea",
        secondary: "Private Traffic Assistant",
        summary: "Helped set up store WeCom groups and ran daily content schedules and promotions.",
      },
    ],
    workTitle: "Experience",
  },
  room: {
    aiEvaluation: "AI evaluation",
    camera: "Camera off",
    candidateInfo: "Candidate info",
    candidateOverview: "Candidate overview",
    candidateRole: "Candidate",
    chat: "Chat",
    closeQuestions: "Close interview questions",
    closeReview: "Close evaluation",
    endMeeting: "End meeting",
    evaluationDetails: "Evaluation details",
    fullscreenResume: "View resume full screen",
    history: [
      {
        label: "Motivation",
        value: "Wants to own the full community growth loop on a larger platform.",
      },
      {
        label: "Status and availability",
        value: "Currently employed; can start within two weeks of the offer.",
      },
      {
        label: "Compensation",
        value: "Currently ¥16,000/month; expects ¥18,000–20,000.",
      },
      {
        label: "Performance and growth",
        value: "Rated A last year; promoted from operations assistant to city community lead.",
      },
      {
        label: "Recent work",
        value:
          "Community Operations at Shiguang Life, covering acquisition, engagement, and backlash for city groups.",
      },
      {
        label: "Highlight project",
        value:
          "“Weekend Check-in” added 4,200 members in 3 weeks; monthly actives rose from 18% to 36%, verified over three months.",
      },
    ],
    historyRoundLabel: "AI screening · 86 · Recommended for live interview",
    hostRole: "Host",
    hrInitial: "HR screening",
    meetingView: "Meeting view",
    microphone: "Microphone",
    participants: "Participants",
    questions: "Questions",
    recording: "Recording",
    referenceNote:
      "Building on answers confirmed in AI screening, keep verifying project details and trade-offs.",
    referenceQuestion: (index: number) => `Reference question ${index}`,
    review: "Evaluate",
    reviewDescription: "Autosaves every second; finish and submit after the meeting.",
    reviewFields: {
      conclusion: "My decision",
      overall: "Overall evaluation",
      professionalSkill: "Professional skill",
      rating: "Rating",
      risks: "Weaknesses and risks",
      rolePosition: "Role fit",
      salary: "Salary suggestion",
      strengths: "Strengths",
    },
    reviewTitle: "Interview evaluation",
    self: " (me)",
    shareScreen: "Share screen",
    submitReview: "Submit evaluation",
    subtitles: "Captions",
    timeline: "Evaluation timeline",
    toggleTheme: "Toggle theme",
  },
  round: {
    attendance: "Attendance",
    detailedAnalysis: "Detailed analysis",
    evaluationStatus: "Evaluation · Submitted",
    evaluationTitle: "Interview evaluation",
    format: "Online interview",
    hideDetails: "Hide detailed analysis",
    interviewer: "Interviewer",
    outcomePass: "Pass",
    scheduledAt: "Oct 9, 14:00 – 15:00",
    showDetails: "Show detailed analysis",
    status: "Status",
    statusCompleted: "Completed",
    statusScheduled: "Upcoming",
    title: (index: number, label: string) => `Round ${index} · ${label}`,
  },
  shell: {
    themeToggle: "Toggle demo theme",
    workbench: "Demo workspace",
  },
  stages: {
    aiCompleted: "Completed · 86",
    aiInterview: "AI interview",
    humanInterview: "Live interview",
    humanPassed: "Completed · Passed",
    inProgress: "In progress",
    invited: "Started",
    offer: "Offer negotiation",
    offerSent: "Sent",
    qualified: "Qualified",
    scheduled: "Scheduled",
    screening: "Screening",
  },
  tour: {
    aiResult: "AI screening scored 86; live interview recommended",
    aiTranscript: "Jump from the evaluation back to the conversation",
    backToMaterials: "Back to meeting materials",
    backToMeeting: "Return to the video call with context intact",
    candidate: "Shinji Ikari · Community Operations — open the full profile",
    detailBack: "Back on the desk, the same record is now in offer negotiation",
    enterInterview: "The candidate joins the voice interview via a private link",
    enterRoom: "Join Shinji's business review",
    evaluation: "Resume evaluation: highly recommended, six dimensions with evidence",
    finishAi: "AI screening done — back to Shinji's results",
    finishHuman: "Review done — back to Shinji's records and evaluation",
    humanAnalysis: "Rated A, excellent skills, suggested as city community lead",
    humanResult: "Business review: rated A, passed",
    humanSchedule: "See the live interview schedule on the same record",
    initialInfo: "Review the project, pay, and availability details from screening",
    launch: "Start AI screening for the same candidate",
    resumeEvaluation: "Check the AI resume evaluation for evidence and risks",
    resumeFullscreen: "Enlarge the resume to check the project history",
    roomMaterials: "Open candidate materials without leaving the meeting",
    roomQuestions: "Open reference questions to dig into the evidence",
    roomReview: "Open the interviewer evaluation form in the meeting",
    scheduleConfirmed: "Schedule and interviewer confirmed",
    transitionHuman: "Move Shinji to a live business review",
    transitionOffer: "Live interview passed — on to offer negotiation",
    turnOne: "AI keeps probing the campaign to pin down his contribution",
    turnTwo: "AI follows up on the metric definition, keeping raw answers as evidence",
  },
};
