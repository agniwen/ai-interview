/**
 * 候选人回答关键词高亮的内置词表与正则。词条为初始集合，可后续增补——不属架构决策。
 * Built-in dictionaries/regex for answer-keyword highlighting; an initial set, extend later.
 */

/** 技能词典：技术 + 管理/能力词。含符号技能按完整字面量登记、整体匹配。 */
export const BUILT_IN_SKILLS: readonly string[] = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "Kotlin",
  "Swift",
  "Go",
  "Rust",
  "C++",
  "C#",
  "PHP",
  "Ruby",
  "Scala",
  "Node.js",
  "React",
  "React Native",
  "Vue",
  "Angular",
  "Next.js",
  "TailwindCSS",
  "HTML",
  "CSS",
  "Spring",
  "Django",
  "Flask",
  "GraphQL",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Kafka",
  "Elasticsearch",
  "Hadoop",
  "Spark",
  "Docker",
  "Kubernetes",
  "AWS",
  "阿里云",
  "Linux",
  "Nginx",
  "项目管理",
  "团队管理",
  "团队协作",
  "跨部门协作",
  "需求分析",
  "架构设计",
  "性能优化",
  "数据分析",
  "机器学习",
  "深度学习",
  "自然语言处理",
  "敏捷开发",
  "带团队",
  "招聘",
  "绩效管理",
  "预算管理",
  "供应链",
  "市场营销",
  "用户增长",
];

/** 风险词：表意含糊或负面的信号词。 */
export const BUILT_IN_RISK_WORDS: readonly string[] = [
  "离职",
  "被裁",
  "裁员",
  "没做过",
  "没接触过",
  "不太清楚",
  "不清楚",
  "不了解",
  "不确定",
  "应该是",
  "大概",
  "可能吧",
  "记不清",
  "忘了",
  "没经验",
  "不擅长",
  "没参与",
  "打杂",
  "被动",
  "没结果",
  "失败",
];

/**
 * 带含义的数字/绩效。五类分支（多字单位 `万元` 必须排在单字 `万`/`元` 之前）：
 * 1. 货币符号前缀数字：`￥500`、`￥500万`
 * 2. 阿拉伯数字紧跟单位/百分号：`30%`、`10人`、`3.5年`、`500万元`、`-30%`（可带负号）
 * 3. K/M 量级：`30K`、`1.2M`（后接字母不算，避免 `3km`）
 * 4. 中文数字/量级 + 万/亿：`千万`、`二十多万`、`上百万`、`几亿`（覆盖中文口语量级）
 * 5. 字母等级评价：`S级`、`A级`、`B+级`（绩效评级，归 metric）
 * 负号 `-` 用 `(?<!\d)` 排除，避免把 `3-5年` 的连字符当负号。
 * 已知噪声（接受）：`2024年`（含单位年份）、`第3名`（序数排名）、`千万`（也可作副词「千万别」）
 * 均会被当 metric 命中——规则不做左侧上下文判定，属可接受噪声。
 */
export const METRIC_REGEX =
  /[￥¥]\d+(?:\.\d+)?(?:[万亿千])?(?:元)?|(?<!\d)-?\d+(?:\.\d+)?(?:万元|万|亿|千|个|人|名|位|年|月|天|次|倍|条|项|台|件|元|%|％)|(?<!\d)-?\d+(?:\.\d+)?[KkMm](?![A-Za-z])|[零一二三四五六七八九十百千两几上数多]+[万亿](?:元)?|[SABCDEFsabcdef][+-]?级/g;
