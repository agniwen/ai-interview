import {
  generateStructuredWithMastraAgent,
  interviewQuestionAgent,
} from "@app/ai-runtime/simple-generators";
import { compileFollowUpContracts } from "./compile-follow-up-contracts";
import type { FollowUpContractGenerator } from "./compile-follow-up-contracts";

const generateFollowUpContracts: FollowUpContractGenerator = (input) =>
  generateStructuredWithMastraAgent({
    agent: interviewQuestionAgent,
    ...input,
    temperature: 0,
  });

export function compileFollowUpContractsWithDefaults(
  questions: Parameters<typeof compileFollowUpContracts>[0],
) {
  return compileFollowUpContracts(questions, generateFollowUpContracts);
}
