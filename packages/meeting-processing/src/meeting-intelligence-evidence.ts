import type { MeetingIntelligencePayload } from "@app/shared/meeting-intelligence";

export function compactIntelligenceEvidence(prompt: string, ids: ReadonlySet<string>) {
  const originals = new Map<string, string>();
  let compactPrompt = prompt;
  for (const id of ids) {
    const alias = `t${originals.size + 1}`;
    if (originals.has(alias) && originals.get(alias) !== id) {
      throw new Error("字幕引用编号冲突");
    }
    originals.set(alias, id);
    compactPrompt = compactPrompt.replaceAll(JSON.stringify(id), JSON.stringify(alias));
  }
  const restoreItem = <T extends { evidenceTurnIds: string[] }>(item: T): T => ({
    ...item,
    evidenceTurnIds: item.evidenceTurnIds.map((id) => {
      const original = originals.get(id);
      if (!original) {
        throw new Error("总结引用了未知字幕");
      }
      return original;
    }),
  });
  return {
    ids: new Set(originals.keys()),
    prompt: compactPrompt,
    restore: (value: MeetingIntelligencePayload): MeetingIntelligencePayload => {
      if (value.template === "general") {
        return {
          ...value,
          actionItems: value.actionItems.map(restoreItem),
          decisions: value.decisions.map(restoreItem),
          openQuestions: value.openQuestions.map(restoreItem),
          topics: value.topics.map(restoreItem),
        };
      }
      return {
        ...value,
        candidateStatements: value.candidateStatements.map(restoreItem),
        followUpActions: value.followUpActions.map(restoreItem),
        keyExperience: value.keyExperience.map(restoreItem),
        verificationItems: value.verificationItems.map(restoreItem),
      };
    },
  };
}
