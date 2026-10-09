import {
  generateStructuredWithMastraAgent,
  interviewQuestionAgent,
} from "@app/ai-runtime/simple-generators";
import { compileFollowUpContracts } from "./compile-follow-up-contracts";
import type { FollowUpContractGenerator } from "./compile-follow-up-contracts";

type StructuredGenerator = (
  input: Parameters<FollowUpContractGenerator>[0] & {
    agent: Parameters<typeof generateStructuredWithMastraAgent>[0]["agent"];
    observabilityLabel: string;
    retryOnInvalid: boolean;
    retryOnTransient: boolean;
    temperature: number;
  },
) => ReturnType<FollowUpContractGenerator>;

function createFollowUpContractGenerator(
  generateStructured: StructuredGenerator,
): FollowUpContractGenerator {
  return (input) =>
    generateStructured({
      agent: interviewQuestionAgent,
      ...input,
      observabilityLabel: "interview-question-follow-up-contracts",
      retryOnInvalid: true,
      retryOnTransient: true,
      temperature: 0,
    });
}

export function compileFollowUpContractsWithDefaults(
  questions: Parameters<typeof compileFollowUpContracts>[0],
  generateStructured: StructuredGenerator = generateStructuredWithMastraAgent,
) {
  return compileFollowUpContracts(questions, createFollowUpContractGenerator(generateStructured));
}
