/* oxlint-disable no-console -- operator script reports progress on stdout. */
import { parseArgs } from "node:util";
import {
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../db";
import { defaultHumanInterviewEvaluationDependencies } from "../human-interview-evaluation/default-dependencies";
import { runHumanInterviewEvaluationProcessing } from "../human-interview-evaluation/processor";
import { humanInterviewEvaluationDao } from "../meeting-processing-daos";

const USAGE = `用法：bun src/scripts/regenerate-human-interview-evaluations.ts --round <roundId> [--round <roundId>] [--apply] [--notify]
  默认只预览；--apply 才会重新生成并写回评价；--notify 在成功后发送"评价已就绪"通知。`;

const { values } = parseArgs({
  options: {
    apply: { default: false, type: "boolean" },
    notify: { default: false, type: "boolean" },
    round: { multiple: true, type: "string" },
  },
});
const roundIds = values.round ?? [];
if (roundIds.length === 0) {
  console.error(USAGE);
  process.exit(1);
}

async function main(): Promise<void> {
  const rounds = await db
    .select({
      evaluationError: humanInterviewRound.evaluationError,
      evaluationStatus: humanInterviewRound.evaluationStatus,
      meetingSessionId: humanInterviewMeeting.processingMeetingSessionId,
      organizationId: humanInterviewRound.organizationId,
      roundId: humanInterviewRound.id,
      roundStatus: humanInterviewRound.status,
    })
    .from(humanInterviewRound)
    .innerJoin(
      humanInterviewMeetingRound,
      eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
    )
    .innerJoin(
      humanInterviewMeeting,
      eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
    )
    .where(inArray(humanInterviewRound.id, roundIds));

  for (const roundId of roundIds) {
    const round = rounds.find((row) => row.roundId === roundId);
    if (!round?.meetingSessionId) {
      console.log(`[skip] ${roundId}：未找到关联的会议处理会话`);
      continue;
    }
    console.log(
      `[round] ${roundId} 轮次=${round.roundStatus} 评价=${round.evaluationStatus} 会话=${round.meetingSessionId}`,
    );
    if (!values.apply) {
      continue;
    }
    const job = await humanInterviewEvaluationDao.requestHumanInterviewEvaluation({
      force: true,
      meetingSessionId: round.meetingSessionId,
      organizationId: round.organizationId,
    });
    if (!job || job.roundId !== roundId) {
      console.log(
        `[skip] ${roundId}：当前状态不允许重新生成（已提交、轮次非 pending 或转录未就绪）`,
      );
      continue;
    }
    await runHumanInterviewEvaluationProcessing(
      job,
      { attempt: 1, maxAttempts: 1 },
      {
        ...defaultHumanInterviewEvaluationDependencies,
        notifyReady: values.notify
          ? defaultHumanInterviewEvaluationDependencies.notifyReady
          : () => Promise.resolve(),
      },
    );
    const [result] = await db
      .select({
        evaluationError: humanInterviewRound.evaluationError,
        evaluationStatus: humanInterviewRound.evaluationStatus,
      })
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, roundId));
    console.log(
      `[done] ${roundId} 评价=${result?.evaluationStatus}${result?.evaluationError ? ` 错误=${result.evaluationError}` : ""}`,
    );
  }
  if (!values.apply) {
    console.log("预览结束；加 --apply 执行重新生成。");
  }
}

try {
  await main();
} finally {
  await closeDatabase();
}
