// 中文：JD 匹配流程；与 resume-screening 类似，但把激活的 JD prompt 注入 screening 上下文
// English: JD-match flow; mirrors resume-screening but injects the active JD prompt
import type { UIMessage } from "ai";
import type { Message, MessageContext, Thread } from "chat";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobDescription } from "@/lib/db/schema";
import { runResumeScreening } from "@/server/routes/resume/screening";
import { JdMatchReportCard } from "../cards/jd-match-report-card";
import { JdStatusCard } from "../cards/jd-status-card";
import { extractResumeReport } from "./_shared/extract-report";

const HISTORY_LIMIT = 20;
const LOG = "[feishu:flow:jd-match]";

function isPdfAttachment(att: NonNullable<Message["attachments"]>[number]): boolean {
  if (att.type !== "file") {
    return false;
  }
  const mime = att.mimeType ?? "";
  const isPdfByName = att.name?.toLowerCase().endsWith(".pdf") ?? false;
  return mime === "application/pdf" || isPdfByName;
}

async function toUIMessage(message: Message): Promise<UIMessage> {
  const role = message.author.isMe ? "assistant" : "user";
  const parts: UIMessage["parts"] = [];
  if (message.text) {
    parts.push({ text: message.text, type: "text" });
  }
  for (const att of message.attachments ?? []) {
    if (!isPdfAttachment(att) || !att.fetchData) {
      continue;
    }
    try {
      const buf = await att.fetchData();
      parts.push({
        filename: att.name ?? "resume.pdf",
        mediaType: "application/pdf",
        type: "file",
        url: `data:application/pdf;base64,${buf.toString("base64")}`,
      });
    } catch (error) {
      console.error(`${LOG} pdf download failed:`, error);
    }
  }
  return { id: message.id, parts, role } as UIMessage;
}

async function buildHistory(thread: Thread, latest: Message): Promise<UIMessage[]> {
  let history: Message[] = [];
  try {
    const result = await thread.adapter.fetchMessages(thread.id, { limit: HISTORY_LIMIT });
    history = result.messages;
  } catch (error) {
    console.error(`${LOG} fetchMessages failed:`, error);
  }
  const filtered = history.filter((m) => m.id !== latest.id);
  const merged = [...filtered, latest];
  const out: UIMessage[] = [];
  for (const m of merged) {
    out.push(await toUIMessage(m));
  }
  return out;
}

export async function runJdMatchFlow(
  thread: Thread,
  message: Message,
  _context: MessageContext | undefined,
  jdId: string,
): Promise<void> {
  console.log(`${LOG} start`, { jdId, threadId: thread.id });

  const [jd] = await db
    .select({ id: jobDescription.id, name: jobDescription.name, prompt: jobDescription.prompt })
    .from(jobDescription)
    .where(eq(jobDescription.id, jdId))
    .limit(1);

  if (!jd) {
    console.warn(`${LOG} active JD missing, hinting user`, { jdId });
    await thread.post(
      JdStatusCard({
        jdLabel: "（该 JD 已失效，请重新 /jd 选择）",
        kind: "activated",
      }) as never,
    );
    return;
  }

  try {
    const messages = await buildHistory(thread, message);
    const currentPdfs = (message.attachments ?? []).filter(isPdfAttachment);
    const currentMessageHasPdf = currentPdfs.length > 0;

    console.log(`${LOG} running screening`, { currentMessageHasPdf, jdName: jd.name });
    const stream = await runResumeScreening({
      enableThinking: false,
      jobDescription: jd.prompt,
      messages,
    });

    const finalText = await stream.text;
    await thread.post(finalText || "（无内容）");

    if (currentMessageHasPdf) {
      try {
        const report = await extractResumeReport(finalText);
        await thread.post(JdMatchReportCard({ ...report, jdTitle: jd.name }) as never);
      } catch (error) {
        console.error(`${LOG} card extraction failed:`, error);
      }
    }
  } catch (error) {
    console.error(`${LOG} FAILED:`, error);
    try {
      await thread.post(`❌ JD 匹配失败：${String(error)}`);
    } catch {
      // ignore
    }
  }
}
