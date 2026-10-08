import type { DemoPlaybackStep } from "./demo-playback";

/** One identity throughout the recruiting workflow; every target belongs to a rendered scene. */
export function getDemoTourSteps(): DemoPlaybackStep[] {
  return [
    {
      caption: "真嗣 · 资深前端工程师，查看完整资料",
      hold: 2200,
      target: '[data-demo-candidate="01842"]',
    },
    {
      caption: "简历评价：非常推荐，六维依据清晰可查",
      hold: 3400,
      target: '[data-demo-detail-tab="evaluation"]',
    },
    { caption: "发起同一位候选人的 AI 初面", hold: 3000, target: "[data-demo-launch]" },
    {
      caption: "候选人通过专属链接进入语音面试",
      hold: 3300,
      target: "[data-demo-enter-interview]",
    },
    {
      caption: "AI 围绕架构升级持续追问，记录具体贡献",
      hold: 3300,
      target: "[data-demo-next-turn]",
    },
    {
      caption: "追问性能指标，保留原始回答和项目证据",
      hold: 3300,
      target: "[data-demo-next-turn]",
    },
    { caption: "AI 初面完成，返回真嗣的面试结果", hold: 2800, target: "[data-demo-finish-ai]" },
    {
      caption: "AI 初面 86 分，建议进入真人面试",
      hold: 3600,
      target: '[data-demo-detail-tab="interviews"]',
    },
    { caption: "从评价回到对话，核对回答依据", hold: 3000, target: "[data-demo-ai-transcript]" },
    {
      caption: "将真嗣流转到真人面试，安排技术复面",
      hold: 3000,
      target: "[data-demo-transition-human]",
    },
    { caption: "面试排期和面试官已确认", hold: 2400, target: "[data-demo-dialog-close]" },
    {
      caption: "查看同一条记录的真人面试安排",
      hold: 3300,
      target: '[data-demo-detail-tab="human"]',
    },
    { caption: "进入真嗣的技术复面会议", hold: 3000, target: "[data-demo-enter-human-room]" },
    {
      caption: "面试中随时查看候选人资料，不离开会议",
      hold: 3400,
      target: "[data-demo-room-materials]",
    },
    {
      caption: "放大简历，核对同一位候选人的工作经历",
      hold: 3300,
      target: '[aria-label="全屏查看简历"]',
    },
    { caption: "返回会议资料视图", hold: 1800, target: "[data-demo-dialog-close]" },
    {
      caption: "对照 AI 简历评价，查看匹配证据和风险",
      hold: 3300,
      target: '[aria-label="评价时间线"] li:first-child button',
    },
    {
      caption: "查看初面收集的项目、薪资与到岗信息",
      hold: 3300,
      target: '[aria-label="评价时间线"] li:nth-child(2) button',
    },
    {
      caption: "展开参考问题，围绕已有证据继续追问",
      hold: 3400,
      target: "[data-demo-room-questions]",
    },
    { caption: "在会议内查看面试官评价表", hold: 3300, target: "[data-demo-room-review]" },
    { caption: "回到视频会议，保持候选人上下文", hold: 2200, target: "[data-demo-room-materials]" },
    {
      caption: "复面完成，返回真嗣的面试记录与评价",
      hold: 2800,
      target: "[data-demo-finish-human]",
    },
    { caption: "技术复面 A 级，结论通过", hold: 3300, target: '[data-demo-detail-tab="human"]' },
    {
      caption: "评级 A，专业技能优，建议高级前端工程师",
      hold: 3600,
      target: "[data-demo-human-analysis] button[aria-expanded]",
    },
    {
      caption: "真人面试通过，进入同一候选人的 Offer 协商",
      hold: 4000,
      target: "[data-demo-transition-offer]",
    },
    {
      caption: "返回招聘台，同一条记录已进入 Offer 协商",
      hold: 2200,
      target: "[data-demo-detail-back]",
    },
  ];
}
