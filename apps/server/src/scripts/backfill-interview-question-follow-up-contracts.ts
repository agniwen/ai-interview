import { asc, eq } from "drizzle-orm";
import { closeDatabase, db } from "../lib/server/db/index";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
} from "@app/db-schema/schema";
import { loadInterviewQuestionTemplateById } from "../server/routes/studio/routes/interview-questions/dao/queries";
import { resolveOrCreateInterviewQuestionTemplateVersion } from "../server/routes/studio/routes/interview-questions/dao/versions";
import { compileFollowUpContractsWithDefaults } from "../server/routes/studio/routes/interview-questions/application/default-compile-follow-up-contracts";
import { hashTemplateSourceSnapshot } from "../lib/server/interview-question-templates-hash";
import type {
  InterviewQuestionTemplateSnapshot,
  InterviewQuestionTemplateSnapshotQuestion,
} from "@app/db-schema/interview-question-templates";

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const repairMutatedVersions = process.argv.includes("--repair-mutated-versions");

function stripFollowUpContracts(
  snapshot: InterviewQuestionTemplateSnapshot,
): InterviewQuestionTemplateSnapshot {
  return {
    ...snapshot,
    questions: snapshot.questions.map(
      ({ followUpContract: _followUpContract, ...question }) => question,
    ),
  };
}

async function main() {
  const templates = await db
    .select({
      id: interviewQuestionTemplate.id,
      organizationId: interviewQuestionTemplate.organizationId,
      title: interviewQuestionTemplate.title,
    })
    .from(interviewQuestionTemplate)
    .orderBy(asc(interviewQuestionTemplate.createdAt));

  let compiledTemplates = 0;
  let compiledQuestions = 0;
  const writes: {
    contracts: Awaited<ReturnType<typeof compileFollowUpContractsWithDefaults>>;
    templateId: string;
  }[] = [];
  for (const template of templates) {
    const record = await loadInterviewQuestionTemplateById(template.organizationId, template.id);
    if (!record) {
      throw new Error(`沟通题不存在：${template.id}`);
    }
    const currentRows = await db
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(eq(interviewQuestionTemplateQuestion.templateId, template.id))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder));
    const questions: InterviewQuestionTemplateSnapshotQuestion[] = currentRows.map((question) => ({
      content: question.content,
      difficulty: question.difficulty,
      evaluationFocus: question.evaluationFocus,
      followUpDirections: question.followUpDirections,
      id: question.id,
      sortOrder: question.sortOrder,
    }));
    const reusableContracts = new Map(
      record.questions.flatMap((question) =>
        question.followUpContract ? [[question.id, question.followUpContract] as const] : [],
      ),
    );
    const needsCompilation = force
      ? questions
      : questions.filter((question) => !reusableContracts.has(question.id));
    if (force) {
      reusableContracts.clear();
    }
    if (needsCompilation.length === 0) {
      console.log(`skip ${template.id} ${template.title}: ${questions.length} questions ready`);
      continue;
    }

    console.log(
      `${apply ? "apply" : "dry-run"} ${template.id} ${template.title}: compile ${needsCompilation.length}/${questions.length}`,
    );
    if (!apply) {
      compiledTemplates += 1;
      compiledQuestions += needsCompilation.length;
      continue;
    }
    const compiled = await compileFollowUpContractsWithDefaults(needsCompilation);
    const contracts = new Map([...reusableContracts, ...compiled]);
    writes.push({ contracts, templateId: template.id });
    compiledTemplates += 1;
    compiledQuestions += needsCompilation.length;
  }

  if (apply && writes.length > 0) {
    await db.transaction(async (tx) => {
      for (const write of writes) {
        if (repairMutatedVersions) {
          const versions = await tx
            .select()
            .from(interviewQuestionTemplateVersion)
            .where(eq(interviewQuestionTemplateVersion.templateId, write.templateId));
          for (const version of versions) {
            if (
              version.contentHash === hashTemplateSourceSnapshot(version.snapshot) &&
              version.snapshot.questions.some((question) => question.followUpContract)
            ) {
              await tx
                .update(interviewQuestionTemplateVersion)
                .set({ snapshot: stripFollowUpContracts(version.snapshot) })
                .where(eq(interviewQuestionTemplateVersion.id, version.id));
            }
          }
        }
        await resolveOrCreateInterviewQuestionTemplateVersion(
          tx,
          write.templateId,
          write.contracts,
        );
      }
    });
  }

  console.log(
    JSON.stringify({
      apply,
      compiledQuestions,
      compiledTemplates,
      force,
      repairMutatedVersions,
      totalTemplates: templates.length,
    }),
  );
}

try {
  await main();
} finally {
  await closeDatabase();
}
