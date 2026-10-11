export interface LegacyFeishuSummaryDelivery {
  conversationId: string;
  interviewRecordId: string;
  notificationId: string;
  providerId: string;
  recipientOpenId: string;
}

interface RetryDeliveryDependencies {
  claim: (notificationId: string) => Promise<boolean>;
  send: (delivery: LegacyFeishuSummaryDelivery) => Promise<{ providerMessageId: string | null }>;
  markSent: (notificationId: string, messageId: string | null) => Promise<void>;
  markFailed: (notificationId: string, error: Error) => Promise<void>;
}

/** Retry the immutable delivery target, never re-resolve the creator's current accounts. */
export async function retryFeishuSummaryDelivery(
  delivery: LegacyFeishuSummaryDelivery,
  dependencies: RetryDeliveryDependencies,
): Promise<boolean> {
  if (!(await dependencies.claim(delivery.notificationId))) {
    return false;
  }
  try {
    const sent = await dependencies.send(delivery);
    await dependencies.markSent(delivery.notificationId, sent.providerMessageId);
  } catch (error) {
    await dependencies.markFailed(
      delivery.notificationId,
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  return true;
}
