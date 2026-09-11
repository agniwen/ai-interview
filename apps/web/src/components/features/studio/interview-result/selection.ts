/** 尚无报告时展示的也是当前面试，而不是历史报告。 */
export function isCurrentInterviewResultSelected(
  selectedConversationId: string | null,
  latestConversationId: string | null | undefined,
): boolean {
  return selectedConversationId === (latestConversationId ?? null);
}
