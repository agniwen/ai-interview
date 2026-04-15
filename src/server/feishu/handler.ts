import type { Message, Thread } from 'chat';
import type { UIMessage } from 'ai';
import { runResumeScreening } from '@/server/routes/resume/screening';
import { ResumeReportCard } from './card';
import { extractResumeReport } from './extract-report';

const HISTORY_LIMIT = 20;

/**
 * Convert a chat-sdk Message into an AI SDK UIMessage with text and
 * (when present) PDF file parts as data: URLs.
 */
async function toUIMessage(message: Message): Promise<UIMessage> {
  const role = message.author.isMe ? 'assistant' : 'user';
  const parts: UIMessage['parts'] = [];

  if (message.text) {
    parts.push({ type: 'text', text: message.text });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.type !== 'file') {
      continue;
    }
    const mime = attachment.mimeType ?? 'application/octet-stream';
    if (mime !== 'application/pdf') {
      continue;
    }
    if (!attachment.fetchData) {
      continue;
    }
    try {
      const buffer = await attachment.fetchData();
      const base64 = buffer.toString('base64');
      parts.push({
        type: 'file',
        mediaType: mime,
        filename: attachment.name ?? 'resume.pdf',
        url: `data:${mime};base64,${base64}`,
      });
    }
    catch {
      // Skip this attachment if it can't be downloaded
    }
  }

  return {
    id: message.id,
    role,
    parts,
  } as UIMessage;
}

async function buildHistory(thread: Thread, latest: Message): Promise<UIMessage[]> {
  let history: Message[] = [];
  try {
    const result = await thread.adapter.fetchMessages(thread.id, { limit: HISTORY_LIMIT });
    history = result.messages;
  }
  catch {
    history = [];
  }

  // Ensure the latest message is included and last
  const seen = new Set(history.map(m => m.id));
  const merged = seen.has(latest.id) ? history : [...history, latest];

  // fetchMessages returns oldest-first per docs; the latest event message
  // may not yet be in the list, so we appended it above.
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
export async function handleResumeMessage(thread: Thread, message: Message): Promise<void> {
  const messages = await buildHistory(thread, message);

  const hasResumePdf = messages.some(m =>
    m.parts.some(part => part.type === 'file' && part.mediaType === 'application/pdf'),
  );

  // If user didn't send a PDF and never has, gently prompt
  if (!hasResumePdf && !message.text?.trim()) {
    await thread.post('请发送一份候选人简历 PDF，我会立即开始筛选分析。');
    return;
  }

  const stream = await runResumeScreening({
    messages,
    enableThinking: true,
  });

  // Stream natural-language analysis
  await thread.post(stream.fullStream);

  // Extract structured fields and post a summary card
  try {
    const finalText = await stream.text;
    const report = await extractResumeReport(finalText);
    const resumeCount = messages.reduce((acc, m) =>
      acc + m.parts.filter(p => p.type === 'file' && p.mediaType === 'application/pdf').length, 0);

    await thread.post(
      ResumeReportCard({
        ...report,
        resumeCount,
      }) as never,
    );
  }
  catch {
    // Card is best-effort; skip if extraction fails
  }
}
