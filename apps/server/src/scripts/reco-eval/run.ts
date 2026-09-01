import { setTimeout as sleep } from "node:timers/promises";
import type {
  ScoreCoreInput,
  ScoreCoreResult,
} from "../../server/routes/studio/routes/job-descriptions/utils/recommendations";
import { classifyPositive } from "./classify";
import { computeMetrics } from "./metrics";
import type { PositiveLabel, PositiveVerdict } from "./types";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i < tries - 1) {
        await sleep(500 * 2 ** i);
      }
    }
  }
  throw new Error(`withRetry exhausted after ${tries} tries`, { cause: last });
}

export interface RunEvalDeps {
  hasVector: (candidateId: string) => Promise<boolean>;
  loadJd: (
    org: string,
    id: string,
  ) => Promise<{ id: string; name: string; description: string | null; prompt: string } | null>;
  score: (input: ScoreCoreInput) => Promise<ScoreCoreResult>;
}

export async function runEval(o: {
  organizationId: string;
  labels: PositiveLabel[];
  deps: RunEvalDeps;
}) {
  const byJd = new Map<string, string[]>();
  for (const l of o.labels) {
    const bucket = byJd.get(l.jobDescriptionId) ?? [];
    bucket.push(l.candidateId);
    byJd.set(l.jobDescriptionId, bucket);
  }
  const verdicts: PositiveVerdict[] = [];
  const failedJds: string[] = [];
  let evaluated = 0;
  for (const [jobDescriptionId, ids] of byJd) {
    // loadJd 抛错=致命(DB)，向上传播；返回 null=岗位缺失，跳过。
    const jd = await o.deps.loadJd(o.organizationId, jobDescriptionId);
    if (!jd) {
      failedJds.push(jobDescriptionId);
      continue;
    }
    let core: ScoreCoreResult;
    try {
      core = await withRetry(() =>
        o.deps.score({
          excludeLinkedExceptIds: new Set(ids),
          jobDescription: {
            departmentName: null,
            id: jd.id,
            name: jd.name,
            prompt: jd.prompt,
          },
          organizationId: o.organizationId,
        }),
      );
    } catch {
      failedJds.push(jobDescriptionId);
      continue;
    }
    const local: PositiveVerdict[] = [];
    let jdFailed = false;
    for (const candidateId of ids) {
      let has: boolean;
      try {
        has = await withRetry(() => o.deps.hasVector(candidateId));
      } catch {
        jdFailed = true;
        break;
      }
      // 纯函数在 try 外，bug 会向上传播而不是被当成远程失败吞掉。
      local.push(classifyPositive({ candidateId, core, hasAnyVector: has, jobDescriptionId }));
    }
    if (jdFailed) {
      // 丢弃 local(整岗原子)。
      failedJds.push(jobDescriptionId);
      continue;
    }
    verdicts.push(...local);
    evaluated += ids.length;
  }
  const total = o.labels.length;
  return {
    coverage: total ? evaluated / total : 0,
    evaluated,
    failedJds,
    metrics: computeMetrics(verdicts),
    total,
    verdicts,
  };
}
