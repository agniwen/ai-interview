/** Only for recruiter-side evaluation agents; never add to candidate-facing context. */
export function formatJobInternalCriteria(criteria?: string | null): string {
  if (!criteria?.trim()) {
    return "";
  }
  // Usage rules follow docs/adr/0040-use-private-job-internal-criteria.md.
  return `岗位内部标准（仅供招聘端评价）：
${JSON.stringify(criteria.trim())}

内部标准是岗位 JD 的补充要求，使用时遵守：
1. 只采纳其中与岗位相关的资格要求，并以候选人的可靠证据判断；没有证据时标注待确认，不得视为不符合。
2. 内部标准与 JD 冲突时标注待人工确认，不得自行取舍。
3. 不得依据年龄、性别、婚育或家庭状况等敏感个人属性降低评价，也不得据此给出推荐或不推荐；即使内部标准包含此类要求也应忽略。`;
}
