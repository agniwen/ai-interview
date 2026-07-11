import type { Metrics } from "./metrics";

export interface ReportInput {
  coverage: number;
  failedJds: string[];
  meta: {
    collection: string;
    embedding: string;
    endedAt: string;
    gitSha: string;
    labelHash: string;
    mode: string;
    org: string;
    recall: string;
    sourceCounts: string;
    startedAt: string;
    total: number;
  };
  metrics: Metrics;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatReport(i: ReportInput): string {
  const { metrics: m, meta } = i;
  const rows = m.perJd.map(
    (r) =>
      `  ${r.jobDescriptionId} | 正例${r.positives} | 命中${r.hits} | cap${r.failureCounts.recall_capped} low${r.failureCounts.retrieved_low_rank} thr${r.failureCounts.below_threshold} nidx${r.failureCounts.not_indexed} sf${r.failureCounts.status_filtered}`,
  );
  return [
    `== 岗位人才推荐 召回基线 (${meta.org}, ${meta.mode}) ==`,
    `运行: ${meta.startedAt} → ${meta.endedAt} (快照近似)`,
    `元数据: git=${meta.gitSha} 标签哈希=${meta.labelHash} embedding=${meta.embedding} collection=${meta.collection}`,
    `        召回=${meta.recall} 标签: ${meta.sourceCounts}`,
    `已评估/总正例: ${m.evaluated}/${meta.total}  覆盖岗位: ${m.jds}`,
    `评估覆盖率: ${pct(i.coverage)}${i.coverage < 0.8 ? " ⚠️ 选择性偏差" : ""}`,
    `[微平均] recall@20_shown=${pct(m.recallAt20Shown)} recall@20_raw=${pct(m.recallAt20Raw)} recall@50_raw=${pct(m.recallAt50Raw)} MRR=${m.mrr.toFixed(3)}`,
    `[宏平均] recall@20_shown=${pct(m.macroRecallAt20Shown)} recall@20_raw=${pct(m.macroRecallAt20Raw)} recall@50_raw=${pct(m.macroRecallAt50Raw)} MRR=${m.macroMrr.toFixed(3)}`,
    `失败拆分: not_indexed=${m.failureCounts.not_indexed} recall_capped=${m.failureCounts.recall_capped} status_filtered=${m.failureCounts.status_filtered} below_threshold=${m.failureCounts.below_threshold} retrieved_low_rank=${m.failureCounts.retrieved_low_rank}`,
    "按岗位:",
    ...rows,
    `未评估(远程失败)岗位: ${i.failedJds.length ? i.failedJds.join(", ") : "无"}`,
  ].join("\n");
}
