export interface DashboardMetricDefinition {
  definition: string;
  label: string;
}

export interface DashboardMetricDefinitionGroup {
  items: DashboardMetricDefinition[];
  title: string;
}

export const DASHBOARD_SCOPE_NOTE =
  "所有指标均统计当前工作区。页面在重新进入或刷新页面时重新计算，最长可能使用 10 秒缓存；除特殊说明外，不包含已归档候选人。";

export const DASHBOARD_METRIC_DEFINITION_GROUPS: DashboardMetricDefinitionGroup[] = [
  {
    items: [
      {
        definition: "当前工作区中岗位状态为“招聘中”的岗位数，不包含已暂停和已停止岗位。",
        label: "在招岗位",
      },
      { definition: "招聘结果仍为推进中的候选人招聘记录数。", label: "推进中" },
      {
        definition: "当前处于定薪、Offer、背调或入职办理阶段，且仍在推进中的候选人数。",
        label: "Offer／待入职",
      },
      { definition: "招聘结果为已录用并完成入职的候选人数。", label: "已入职" },
      { definition: "招聘结果为淘汰或候选人撤回的记录数。", label: "负向结案" },
      {
        definition:
          "所有岗位状态为“招聘中”且已配置计划人数的岗位，分别按“计划人数减去已入职人数”计算，不足 0 按 0 计，再汇总；已暂停和已停止岗位不参与统计。部分岗位未配置时在已知缺口后显示“+”，全部未配置时显示为“—”。",
        label: "岗位缺口",
      },
    ],
    title: "经营指标",
  },
  {
    items: [
      { definition: "所有未归档的候选人招聘记录数。", label: "简历入库" },
      {
        definition: "累计进入过 AI 面试或任一后续环节的候选人数，不要求当前仍处于该阶段。",
        label: "进入面试",
      },
      {
        definition: "累计进入过真人复面或任一后续环节的候选人数，明确跳过前序节点也计入。",
        label: "进入复面",
      },
      {
        definition: "累计进入过定薪、Offer、背调或入职办理环节的候选人数。",
        label: "进入 Offer／待入职",
      },
      { definition: "最终招聘结果为已录用并完成入职的候选人数。", label: "已入职" },
      {
        definition:
          "本环节累计人数除以上一环节累计人数，四舍五入到整数百分比；“简历入库”为基准，有数据时显示 100%。",
        label: "环节转化率",
      },
    ],
    title: "转化漏斗",
  },
  {
    items: [
      {
        definition: "按招聘记录创建人汇总的未归档候选人招聘记录数。",
        label: "招聘记录数",
      },
      { definition: "当前处于 AI 面试、真人二面或终面阶段的人数。", label: "面试中" },
      { definition: "当前处于定薪、Offer、背调或入职办理阶段的人数。", label: "Offer／待入职" },
      { definition: "该创建人对应的招聘记录中，招聘结果为已录用的人数。", label: "已入职" },
      {
        definition:
          "当前待筛选，或存在待开始、中断的 AI 面试，或待完成真人面试的候选人数；按候选人招聘记录去重。",
        label: "待处理",
      },
    ],
    title: "HR 招聘进展",
  },
  {
    items: [
      {
        definition: "未归档候选人中，已经创建过至少一轮 AI 面试的候选人数占比。",
        label: "AI 发起率",
      },
      { definition: "按北京时间统计，近 30 个自然日新建的候选人招聘记录数。", label: "新增简历" },
      { definition: "按北京时间统计，近 30 个自然日完成的 AI 面试轮次数。", label: "AI 完成" },
      { definition: "按北京时间统计，近 30 个自然日完成的真人面试轮次数。", label: "复面完成" },
      { definition: "按北京时间统计，近 30 个自然日实际发出的 Offer 数。", label: "Offer 发出" },
      { definition: "当前工作区全部 Offer 按其最新状态汇总。", label: "Offer 状态" },
    ],
    title: "近 30 天指标",
  },
];
