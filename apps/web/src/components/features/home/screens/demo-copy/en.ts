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
      "Held Unit-01's sniper position and landed the decisive second shot after the positron rifle recharged.",
    contributionTitle: "Personal contribution in Operation Yashima",
    conversationLabel: "Conversation",
    conversationQuestions: "Conversation questions",
    conversationValue: "12 candidate replies",
    copyLink: "Copy interview link",
    endTime: "End time",
    formAnswers: [
      { label: "Experience", value: "1 year in active combat" },
      { label: "Expected salary", value: "¥32,000–35,000 / month" },
      { label: "Availability", value: "Can relocate to Tokyo-3 once the offer is confirmed" },
    ],
    formQuestions: "Form questions",
    hideTranscript: "Hide transcript",
    itemCount: (count: number) => `${count} items`,
    recommendBadge: "Recommended",
    resultMarkdown:
      "**Advance to a live interview.** Shinji clearly explained the sniping plan in Operation Yashima, his emergency-ejection protocol, and how he raised his sync ratio. His contribution is specific: neural link start-up dropped from 3.2 s to 1.4 s, backed by two weeks of sync test data. The live round should probe his judgment under pressure.",
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
        "I took Unit-01's sniper position while Unit-00 held the shield. The positron rifle drew on all of Japan's power grid. The first shot was deflected by the Angel's interference, so I fired again after the 20-second recharge and pierced the Fifth Angel's core.",
      question: "Walk me through Operation Yashima and the part you personally owned.",
    },
    {
      answer:
        "I first check the neural link error rate reported by MAGI to decide whether to keep fighting. Once the umbilical cable is cut, the internal battery lasts only five minutes, so I confirm the recovery route in advance. Past the threshold, Operations triggers an emergency entry-plug ejection.",
      question: "When your sync ratio fluctuates mid-battle, how do you respond and evacuate?",
    },
    {
      answer:
        "Dr. Akagi logged my sync curve for two weeks under identical test-plug conditions, compared P75 values, and ruled out changes in LCL concentration. Neural link start-up also dropped from 3.2 s to 1.4 s.",
      question:
        "Your sync ratio rose from 41.3% to over 70%. How did you confirm the data is valid?",
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
          period: "2025–2027",
          primary: "Tokyo-3 Municipal First Middle School",
          secondary: "Class 2-A",
        },
      ],
      focus: [
        {
          content:
            "Long-term Unit-00 test pilot with a steady record of unit control and sync tests.",
          kind: "matching",
          point: "Unit control",
        },
        {
          content: "Shielded Unit-01 during Operation Yashima and held the formation's defense.",
          kind: "matching",
          point: "Defensive cover",
        },
        {
          content:
            "The resume says little about personal motivation; confirm communication and teamwork in the final round.",
          kind: "risk",
          point: "Communication",
        },
      ],
      job: "NERV Japan Branch / Eva Unit-00 Pilot",
      name: "Rei Ayanami",
      stage: "Live interview",
      summary:
        "The First Child and Unit-00's long-term test pilot; held the shield in Operation Yashima and executes orders reliably.",
      verdict: "Recommended",
      work: [
        { period: "2025–now", primary: "NERV Japan Branch", secondary: "Eva Unit-00 Pilot" },
        { period: "2015–2025", primary: "NERV HQ", secondary: "Sync test subject" },
      ],
    },
    "00002": {
      detail: "Second round · Scheduled",
      education: [
        { period: "2024–2025", primary: "A German university", secondary: "Graduated early" },
      ],
      focus: [
        {
          content:
            "Led the assault in Unit-02 against the Seventh Angel; strong close-combat record.",
          kind: "matching",
          point: "Close combat",
        },
        {
          content: "Completed the D-type dive into the Mt. Asama crater.",
          kind: "matching",
          point: "Hostile environments",
        },
        {
          content: "Tends to act alone; verify teamwork and chain of command in the next round.",
          kind: "risk",
          point: "Formation play",
        },
      ],
      job: "NERV Japan Branch / Eva Unit-02 Pilot",
      name: "Asuka Langley Soryu",
      stage: "Live interview",
      summary:
        "The Second Child; finished full pilot training at the German branch with standout melee and special-environment combat.",
      verdict: "Recommended",
      work: [
        { period: "2026–now", primary: "NERV Japan Branch", secondary: "Eva Unit-02 Pilot" },
        { period: "2016–2026", primary: "NERV German Branch", secondary: "Pilot trainee" },
      ],
    },
    "00004": {
      detail: "Pending",
      education: [
        {
          period: "2025–2027",
          primary: "Tokyo-3 Municipal First Middle School",
          secondary: "Class 2-A",
        },
      ],
      focus: [
        {
          content: "Solid fitness and hand-to-hand basics, suited to intensive training.",
          kind: "matching",
          point: "Fitness",
        },
        {
          content: "No live sync record yet; combat experience needs testing.",
          kind: "risk",
          point: "Combat record",
        },
        {
          content: "Selected as a stand-in pilot; Child eligibility still needs confirmation.",
          kind: "risk",
          point: "Selection",
        },
      ],
      job: "NERV US 1st Branch / Eva Unit-03 Pilot",
      name: "Toji Suzuhara",
      stage: "Screening",
      summary:
        "The Fourth Child, a hastily selected reserve pilot; strong physically but no live sync record yet.",
      verdict: "Undecided",
      work: [
        { period: "2026–now", primary: "NERV Japan Branch", secondary: "Unit-03 reserve pilot" },
        {
          period: "2024–2026",
          primary: "First Middle School basketball team",
          secondary: "Starter",
        },
      ],
    },
    "00005": {
      detail: "Qualified",
      education: [
        { period: "—", primary: "SEELE-affiliated institute", secondary: "Background unverified" },
      ],
      focus: [
        {
          content: "Can set his own sync ratio, far beyond the role requirement.",
          kind: "matching",
          point: "Sync ratio",
        },
        {
          content: "Sent directly by SEELE; identity and dispatch background need careful checks.",
          kind: "risk",
          point: "Dispatch",
        },
        {
          content: "No stated long-term commitment to NERV; confirm where he stands.",
          kind: "risk",
          point: "Commitment",
        },
      ],
      job: "NERV Japan Branch / Eva Unit-02 Pilot (reserve)",
      name: "Kaworu Nagisa",
      stage: "Screening",
      summary:
        "The Fifth Child, sent directly by SEELE and able to set his own sync ratio; identity and dispatch background need close review.",
      verdict: "Undecided",
      work: [
        { period: "2026–now", primary: "NERV Japan Branch", secondary: "Reserve pilot" },
        { period: "—", primary: "SEELE", secondary: "Direct dispatch" },
      ],
    },
    "00006": {
      detail: "Negotiating",
      education: [
        { period: "2018–2022", primary: "NERV Euro Branch", secondary: "Pilot training program" },
      ],
      focus: [
        {
          content: "Adapts quickly and can take over a unit in an emergency.",
          kind: "matching",
          point: "Improvisation",
        },
        {
          content: "Has piloted several unit types and adapts across them.",
          kind: "matching",
          point: "Multi-unit",
        },
        {
          content: "Once piloted Unit-02 without authorization; confirm process compliance.",
          kind: "risk",
          point: "Authorization",
        },
      ],
      job: "NERV Euro Branch / Eva Unit-08 Pilot",
      name: "Mari Illustrious Makinami",
      stage: "Offer negotiation",
      summary:
        "Transferred from the Euro branch and great at improvising; once completed a sortie in Unit-02 without authorization.",
      verdict: "Recommended",
      work: [
        { period: "2026–now", primary: "NERV Euro Branch", secondary: "Eva Unit-08 Pilot" },
        { period: "2022–2026", primary: "NERV Euro Branch", secondary: "Prototype unit pilot" },
      ],
    },
  },
  detail: {
    activityNote: "Misato Katsuragi · Added resume and linked it to Eva Unit-01 Pilot",
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
      "The Third Child. Fought in 14 Angel interception operations and cut neural link start-up from 3.2 s to 1.4 s.",
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
    workYears: "1 year in active combat",
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
    questionKinds: ["Combat record", "Emergency response", "Sync performance"],
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
      "Building on the combat evidence confirmed in AI screening, verify sniping decisions, emergency ejection, and sync ratio data. Both the candidate and the interviewer have confirmed this slot.",
    scheduleFocusTitle: "Interview focus",
    structuredResume: "Structured resume",
    viewCandidatePage: "View candidate interview page",
  },
  evaluation: {
    conciseOverall:
      "Shinji Ikari, the Third Child, repelled the Third Angel on his first sortie in Unit-01. His sync ratio is stable and his combat record is complete, giving him the reaction speed and execution an Eva pilot needs. Advance to interview.",
    dimensions: {
      educationBackground:
        "Currently at Tokyo-3 Municipal First Middle School with NERV pilot fundamentals training; academic background broadly fits the role.",
      experienceRelevance:
        "Flew 14 Angel interception operations spanning melee, sniping, and underwater combat; directly relevant to the role.",
      potential:
        "Grew from an emergency draftee into a lead pilot who volunteers for sorties, peaking at a 400% sync ratio.",
      projectMatch:
        "Took part in Operation Yashima and the synchronized twin-unit strike on the Seventh Angel, covering solo sniping and formation work.",
      skillMatch:
        "Proficient in entry-plug operation, AT Field neutralization, and positron rifle sniping; cut neural link start-up from 3.2 s to 1.4 s.",
      stability:
        "Repeatedly says “I mustn't run away” and shows up consistently; one record of running away from home, but long-term attendance holds.",
    },
    judgment:
      "**Highly recommended.** Neural sync, AT Field neutralization, and multi-unit combat experience closely match the Eva Unit-01 Pilot role. He can independently hold the front line.",
    matchingEvidence: [
      {
        content: "Has a multi-unit combat record covering the formation work the role requires.",
        jobRequirement: "Experience intercepting Angels alongside other units",
        point: "Multi-unit ops",
        resumeEvidence:
          "Defeated the Seventh Angel with Units 00 and 02 in a synchronized twin-unit strike",
      },
      {
        content: "Sync ratio gains are quantified, meeting the role's neural link stability bar.",
        jobRequirement: "Neural sync ratio steady above 60%",
        point: "Sync ratio",
        resumeEvidence: "41.3% on first sortie, steady above 70% within three months",
      },
      {
        content: "Has made long-range shots when it mattered and handles weapons fully.",
        jobRequirement: "Familiar with long-range weapons such as the positron rifle",
        point: "Long-range sniping",
        resumeEvidence: "Landed the decisive second positron rifle shot in Operation Yashima",
      },
    ],
    risks: [
      {
        content:
          "The resume does not cover how he handles a Unit-01 berserk event, and he once left his post without permission. Verify in the live interview.",
        jobRequirement: "Sound judgment in high-pressure combat",
        point: "Composure",
        resumeEvidence: null,
      },
    ],
    seniorityLevel: "Dedicated Eva Unit-01 Pilot",
    seniorityRationale:
      "Can hold the front line independently and follow Operations' command in multi-unit battles.",
    teamRationale:
      "Suited to piloting Unit-01 on critical interceptions, forming a squad with the Unit-00 and Unit-02 pilots.",
    teamSuggestion: "Lead pilot / Front-line interception",
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
      "Combat judgment: separates solo sniping from formation cover and has a clear evacuation plan.\nSync performance: explains how sync curves are measured and how training and LCL conditions affect them.\nTeamwork: works smoothly with the Unit-00 and Unit-02 pilots and follows Operations' live orders.",
    overallEvaluation:
      "**Pass the operations review.** Shinji clearly explained his sniping decision in Operation Yashima and his evacuation plan when sync fluctuates, and verifies sync data reliably. A good match for Eva Unit-01 Pilot.",
    professionalSkill: "Excellent",
    rating: "A",
    risks:
      "Occasionally avoidant under pressure and needs steady check-ins from the Operations Director; berserk-mode handling to be assessed separately.",
    rolePosition: "Lead pilot / Front-line interception",
    salaryRecommendation: "¥32,000–35,000 per month plus pilot hazard pay",
    strengths:
      "Steady sync gains; sorties when it counts; decides from MAGI data; strong formation awareness.",
  },
  humanInterview: {
    focusItems: [
      "How do you split duties between solo sniping and formation cover?",
      "When sync goes abnormal, how do you decide whether to evacuate?",
      "How do you verify that sync training carries into real combat?",
    ],
    focusNote: "Use the combat evidence confirmed in AI screening to dig into key decisions.",
    focusTitle: "Focus for this round",
    history: "Past interviews",
    pending: "To do",
    progressDescription: "Review schedules, round results, and interview evaluations",
    progressTitle: "Live interview progress",
    roundLabel: "Operations review",
    schedule: "Schedule interview",
  },
  job: {
    label: "NERV Japan Branch / Eva Unit-01 Pilot",
    title: "Eva Unit-01 Pilot",
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
      { label: "Expected monthly pay", value: "¥ 35,000" },
      { label: "Current monthly pay", value: "¥ 30,000" },
      { label: "Post-probation pay", value: "¥ 34,000" },
      { label: "Probation pay", value: "¥ 34,000" },
      { label: "Earliest start", value: "2026/11/02" },
      { label: "Notes", value: "Passed operations review; package agreed" },
    ],
    expectationsNote: "Collect the candidate's expectations before sending an offer.",
    expectationsTitle: "Candidate expectations",
    fields: [
      { label: "Position", value: "Dedicated Eva Unit-01 Pilot" },
      { label: "Base monthly pay", value: "¥ 34,000" },
      { label: "Annual bonus", value: "¥ 68,000" },
      { label: "Benefits", value: "NERV HQ housing and school allowance" },
      { label: "Expected start", value: "2026/11/02" },
      { label: "Offer valid until", value: "2026/10/16" },
      { label: "Email status", value: "Sent to shinji@nerv.example · 10/10 10:05" },
    ],
    notes:
      "Passed the operations review; package confirmed with the Operations Director. 3-month probation at 100% pay.",
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
        period: "2025–2027",
        primary: "Tokyo-3 Municipal First Middle School",
        secondary: "Class 2-A",
      },
    ],
    educationTitle: "Education",
    fileName: "Shinji_Ikari_Eva_Pilot.pdf",
    previewSubtitle: "1 year in combat · Sync tuning · AT Field · Positron sniping",
    skills: ["Sync tuning", "AT Field neutralization", "Positron sniping", "Angel interception"],
    skillsTitle: "Skills",
    summary:
      "The Third Child; repelled the Third Angel on his first sortie. Sync ratio closely matches the role's core needs.",
    work: [
      {
        period: "2026–now",
        primary: "NERV Japan Branch",
        secondary: "Eva Unit-01 Pilot",
        summary:
          "Handles Angel interception and formation combat; landed the decisive shot in Operation Yashima.",
      },
      {
        period: "2021–2026",
        primary: "Tokyo-2",
        secondary: "Cello lessons",
        summary:
          "Practiced cello for five years, building long focus and a steady sense of rhythm.",
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
        value: "Wants to be recognized and take on fuller front-line responsibility.",
      },
      {
        label: "Status and availability",
        value: "On standby at NERV; can relocate to Tokyo-3 once the offer is confirmed.",
      },
      {
        label: "Compensation",
        value: "Currently ¥30,000 per month; expects ¥32,000–35,000 plus hazard pay.",
      },
      {
        label: "Performance and growth",
        value: "Went from emergency draftee to lead pilot; joins debriefs and formation drills.",
      },
      {
        label: "Recent work",
        value:
          "Eva Unit-01 Pilot at NERV Japan Branch, covering interception, formation work, and sync tests.",
      },
      {
        label: "Highlight project",
        value:
          "Decisive shot in Operation Yashima; neural link start-up cut from 3.2 s to 1.4 s, verified with two weeks of P75 sync curves.",
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
      "Build on the answers confirmed in AI screening to verify combat details and trade-offs.",
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
    candidate: "Shinji Ikari · Eva Unit-01 Pilot — open the full profile",
    detailBack: "Back on the desk, the same record is now in offer negotiation",
    enterInterview: "The candidate joins the voice interview via a private link",
    enterRoom: "Join Shinji's operations review",
    evaluation: "Resume evaluation: highly recommended, six dimensions with evidence",
    finishAi: "AI screening done — back to Shinji's results",
    finishHuman: "Review done — back to Shinji's records and evaluation",
    humanAnalysis: "Rated A, excellent skills, suggested as dedicated Unit-01 pilot",
    humanResult: "Operations review: rated A, passed",
    humanSchedule: "See the live interview schedule on the same record",
    initialInfo: "Review the combat, pay, and relocation details from screening",
    launch: "Start AI screening for the same candidate",
    resumeEvaluation: "Check the AI resume evaluation for evidence and risks",
    resumeFullscreen: "Enlarge the resume to check the combat record",
    roomMaterials: "Open candidate materials without leaving the meeting",
    roomQuestions: "Open reference questions to dig into the evidence",
    roomReview: "Open the interviewer evaluation form in the meeting",
    scheduleConfirmed: "Schedule and interviewer confirmed",
    transitionHuman: "Move Shinji to a live operations review",
    transitionOffer: "Live interview passed — on to offer negotiation",
    turnOne: "AI keeps probing Operation Yashima to pin down his contribution",
    turnTwo: "AI follows up on sync data, keeping raw answers as evidence",
  },
};
