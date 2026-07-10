import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getResumeEmbeddingConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { getResumeSemanticIndexConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  createDefaultRecommendationDeps,
  scoreCandidatesForJobDescription,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";
import { dedupeLabels, validateLabels } from "./reco-eval/labels";
import { loadValidLabelKeys, mineLabels } from "./reco-eval/mine-labels";
import { formatReport } from "./reco-eval/report";
import { runEval } from "./reco-eval/run";
import type { PositiveLabel } from "./reco-eval/types";

function arg(name: string, fallback?: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    return eq.slice(name.length + 3);
  }
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) {
    const next = process.argv[idx + 1];
    if (next !== undefined) {
      return next;
    }
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`missing --${name}`);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const org = arg("org", "org_default");
  const mode = arg("mode", "b-only");
  const strict = hasFlag("strict");
  const startedAt = new Date().toISOString();
  const embeddingConfig = getResumeEmbeddingConfig();
  const semantic = getResumeSemanticIndexConfig();
  if (!(semantic.qdrantUrl && embeddingConfig.apiKey)) {
    throw new Error("语义配置未启用（QDRANT_URL / RESUME_EMBEDDING_API_KEY 缺失）");
  }
  const store = new QdrantResumeVectorStore({
    apiKey: semantic.qdrantApiKey,
    collectionName: semantic.qdrantCollectionName,
    dimensions: embeddingConfig.dimensions,
    url: semantic.qdrantUrl,
  });
  if (!(await store.hasCollection())) {
    throw new Error(`collection ${semantic.qdrantCollectionName} 不存在（只读评测拒绝创建）`);
  }

  const mined = await mineLabels(org);
  const fromFile: PositiveLabel[] =
    mode === "a-plus-b" ? JSON.parse(readFileSync(arg("labels"), "utf-8")) : [];
  const { conflicts, labels: deduped } = dedupeLabels([...mined, ...fromFile]);
  const validKeys = await loadValidLabelKeys(org);
  const { invalid, valid } = validateLabels(deduped, validKeys);

  const deps = { ...createDefaultRecommendationDeps(), vectorStore: store };
  const result = await runEval({
    deps: {
      hasVector: async (id: string) => {
        const chunks = await store.loadResumeEmbeddings({
          embeddingVersion: semantic.embeddingVersion,
          organizationId: org,
          sourceId: id,
          sourceType: "studio_interview",
        });
        return chunks.length > 0;
      },
      loadJd: (o: string, id: string) => loadJobDescriptionById(o, id),
      score: (input) => scoreCandidatesForJobDescription(input, deps),
    },
    labels: valid,
    organizationId: org,
  });

  const endedAt = new Date().toISOString();
  const report = formatReport({
    coverage: result.coverage,
    failedJds: result.failedJds,
    meta: {
      collection: semantic.qdrantCollectionName,
      embedding: `${embeddingConfig.model}@${semantic.embeddingVersion}`,
      endedAt,
      gitSha: execSync("git rev-parse --short HEAD").toString().trim(),
      labelHash: createHash("sha256").update(JSON.stringify(valid)).digest("hex").slice(0, 12),
      mode,
      org,
      recall: "[40,50,50] th=55 topK=20",
      sourceCounts: `mined=${mined.length} manual=${fromFile.length} invalid=${invalid} conflicts=${conflicts}`,
      startedAt,
      total: valid.length,
    },
    metrics: result.metrics,
  });

  mkdirSync(".eval", { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  // b-only 种子，供 A 补强工具后续读取。
  writeFileSync(".eval/labels.json", JSON.stringify(mined, null, 2));
  writeFileSync(`.eval/report-${mode}-${stamp}.md`, `${report}\n`);
  writeFileSync(
    `.eval/detail-${mode}-${stamp}.jsonl`,
    result.verdicts.map((v) => JSON.stringify(v)).join("\n"),
  );
  console.log(report);
  if (result.evaluated === 0) {
    throw new Error("evaluated=0（全部岗位失败/无有效标签）");
  }
  if (strict && result.coverage < 0.8) {
    throw new Error(`覆盖率 ${(result.coverage * 100).toFixed(1)}% < 80% (--strict)`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
