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
 * 带含义的数字：数字必须紧邻单位才命中，数字与单位间不允许空格（spec「紧跟」）。
 * 两种形态：货币符号前缀数字，或数字后紧跟单位/百分号。
 * 分支顺序：货币前缀 → 数字+单位（多字单位 `万元` 必须排在单字 `万`/`元` 之前）。
 * 已知噪声（接受）：`2024年` 这类含单位的年份会被当 metric 命中，为保住「3年」不单独排除。
 */
export const METRIC_REGEX =
  /[￥¥]\d+(?:\.\d+)?(?:[万亿千])?(?:元)?|\d+(?:\.\d+)?(?:万元|万|亿|千|个|人|名|位|年|月|天|次|倍|条|项|台|件|元|%|％)/g;
