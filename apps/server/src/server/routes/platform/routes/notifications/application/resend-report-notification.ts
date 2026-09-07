import { sendInterviewReportReadyFeishuNotification } from "../../../../agent/utils/feishu-interview-notifications";
import { claimPlatformReportResend, finishPlatformReportResend } from "../resend-dao";

export async function resendPlatformReportNotification(
  notificationId: string,
  recipientUserId?: string,
  send = sendInterviewReportReadyFeishuNotification,
) {
  const delivery = await claimPlatformReportResend(notificationId, recipientUserId);
  try {
    const result = await send(delivery);
    const sentAt = new Date();
    await finishPlatformReportResend(delivery.notificationId, {
      messageId: result.providerMessageId,
      sentAt,
    });
    return { notificationId: delivery.notificationId, sentAt: sentAt.toISOString() };
  } catch (error) {
    // A thrown transport request may still have sent the card. Preserve the
    // uncertainty instead of scheduling an automatic duplicate.
    await finishPlatformReportResend(delivery.notificationId, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
