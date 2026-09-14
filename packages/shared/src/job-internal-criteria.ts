/** Only for recruiter-side evaluation agents; never add to candidate-facing context. */
export function formatJobInternalCriteria(criteria?: string | null): string {
  if (!criteria?.trim()) {
    return "";
  }
  return `岗位内部标准（仅供招聘端评价）：
${JSON.stringify(criteria.trim())}

内部标准是岗位的补充要求，优先以岗位内部标准为判断准则。`;
}
