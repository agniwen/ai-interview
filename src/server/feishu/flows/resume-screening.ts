import type { UIMessage } from "ai";
import type { Message, MessageContext, Thread } from "chat";
import { runResumeScreening } from "@/server/routes/resume/screening";
import { ResumeReportCard } from "../cards/resume-report-card";
import { extractResumeReport } from "./_shared/extract-report";

const HISTORY_LIMIT = 20;

/**
 * Convert a chat-sdk Message into an AI SDK UIMessage with text and
 * (when present) PDF file parts as data: URLs.
 */
async function toUIMessage(message: Message): Promise<UIMessage> {
  const role = message.author.isMe ? "assistant" : "user";
  const parts: UIMessage["parts"] = [];

  if (message.text) {
    parts.push({ text: message.text, type: "text" });
  }

  for (const attachment of message.attachments ?? []) {
    console.log("[feishu:flow:resume-screening] attachment seen", {
      hasFetchData: !!attachment.fetchData,
      mimeType: attachment.mimeType,
      name: attachment.name,
      type: attachment.type,
    });
    if (attachment.type !== "file") {
      console.log("[feishu:flow:resume-screening] skip non-file attachment");
      continue;
    }
    const mime = attachment.mimeType ?? "application/octet-stream";
    const isPdfByName = attachment.name?.toLowerCase().endsWith(".pdf") ?? false;
    if (mime !== "application/pdf" && !isPdfByName) {
      console.log("[feishu:flow:resume-screening] skip non-pdf attachment", {
        mime,
        name: attachment.name,
      });
      continue;
    }
    if (!attachment.fetchData) {
      console.log("[feishu:flow:resume-screening] skip attachment without fetchData");
      continue;
    }
    try {
      const buffer = await attachment.fetchData();
      const base64 = buffer.toString("base64");
      console.log("[feishu:flow:resume-screening] downloaded pdf", {
        bytes: buffer.length,
        name: attachment.name,
      });
      parts.push({
        filename: attachment.name ?? "resume.pdf",
        mediaType: "application/pdf",
        type: "file",
        url: `data:application/pdf;base64,${base64}`,
      });
    } catch (downloadError) {
      console.error("[feishu:flow:resume-screening] PDF download FAILED:", downloadError);
    }
  }

  return {
    id: message.id,
    parts,
    role,
  } as UIMessage;
}

async function buildHistory(thread: Thread, latest: Message): Promise<UIMessage[]> {
  let history: Message[] = [];
  try {
    const result = await thread.adapter.fetchMessages(thread.id, { limit: HISTORY_LIMIT });
    history = result.messages;
  } catch (error) {
    console.error(
      "[feishu:flow:resume-screening] fetchMessages failed, proceeding without history:",
      error,
    );
    history = [];
  }

  // Always use the webhook version of the latest message (it carries full
  // attachment data including fetchData callbacks) instead of the API-fetched
  // version which may be incomplete for newly-sent file messages.
  const filtered = history.filter((m) => m.id !== latest.id);
  const merged = [...filtered, latest];

  const ui: UIMessage[] = [];
  for (const m of merged) {
    ui.push(await toUIMessage(m));
  }

  return ui;
}

/**
 * Handle an incoming Feishu message: run resume screening, stream the
 * natural-language analysis to the thread, then post a structured
 * summary card extracted from the result.
 */
export async function runResumeScreeningFlow(
  thread: Thread,
  message: Message,
  context?: MessageContext,
): Promise<void> {
  const skipped = context?.skipped?.length ?? 0;
  console.log("[feishu:flow:resume-screening] start", {
    attachments: message.attachments?.length ?? 0,
    skipped,
    text: message.text,
    threadId: thread.id,
  });

  try {
    const messages = await buildHistory(thread, message);
    console.log("[feishu:flow:resume-screening] history built", { count: messages.length });

    const hasResumePdf = messages.some((m) =>
      m.parts.some((part) => part.type === "file" && part.mediaType === "application/pdf"),
    );

    console.log("[feishu:flow:resume-screening] running screening", { hasResumePdf });
    const stream = await runResumeScreening({ enableThinking: true, messages });

    // Feishu does not support editing text messages (their PATCH API only
    // accepts interactive cards), so chat-sdk's post+edit streaming
    // fallback fails with code 230001. Instead, await the full text and
    // post once.
    console.log("[feishu:flow:resume-screening] awaiting final text");
    const finalText = await stream.text;
    console.log("[feishu:flow:resume-screening] posting text", { textLen: finalText.length });
    await thread.post(finalText || "（无内容）");
    console.log("[feishu:flow:resume-screening] text posted");

    // Only extract and post a structured report card when resumes were analyzed
    if (hasResumePdf) {
      try {
        console.log("[feishu:flow:resume-screening] extracting report");
        const report = await extractResumeReport(finalText);
        const resumeCount = messages.reduce(
          (acc, m) =>
            acc +
            m.parts.filter((p) => p.type === "file" && p.mediaType === "application/pdf").length,
          0,
        );

        await thread.post(ResumeReportCard({ ...report, resumeCount }) as never);
        console.log("[feishu:flow:resume-screening] card posted");
      } catch (cardError) {
        console.error("[feishu:flow:resume-screening] card extraction failed:", cardError);
      }
    }
  } catch (error) {
    const stack = error instanceof Error ? error.stack : String(error);
    console.error("[feishu:flow:resume-screening] FAILED:", stack);
    try {
      await thread.post(`❌ 处理失败：${String(error)}`);
    } catch {
      // ignore
    }
  }
}
