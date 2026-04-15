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
    console.log('[feishu-handler] attachment seen', {
      type: attachment.type,
      name: attachment.name,
      mimeType: attachment.mimeType,
      hasFetchData: !!attachment.fetchData,
    });
    if (attachment.type !== 'file') {
      console.log('[feishu-handler] skip non-file attachment');
      continue;
    }
    const mime = attachment.mimeType ?? 'application/octet-stream';
    const isPdfByName = attachment.name?.toLowerCase().endsWith('.pdf') ?? false;
    if (mime !== 'application/pdf' && !isPdfByName) {
      console.log('[feishu-handler] skip non-pdf attachment', { mime, name: attachment.name });
      continue;
    }
    if (!attachment.fetchData) {
      console.log('[feishu-handler] skip attachment without fetchData');
      continue;
    }
    try {
      const buffer = await attachment.fetchData();
      const base64 = buffer.toString('base64');
      console.log('[feishu-handler] downloaded pdf', {
        name: attachment.name,
        bytes: buffer.length,
      });
      parts.push({
        type: 'file',
        mediaType: 'application/pdf',
        filename: attachment.name ?? 'resume.pdf',
        url: `data:application/pdf;base64,${base64}`,
      });
    }
    catch (downloadError) {
      console.error('[feishu-handler] PDF download FAILED:', downloadError);
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
  console.log('[feishu-handler] start', { threadId: thread.id, text: message.text, attachments: message.attachments?.length ?? 0 });
  try {
    const messages = await buildHistory(thread, message);
    console.log('[feishu-handler] history built', { count: messages.length });

    const hasResumePdf = messages.some(m =>
      m.parts.some(part => part.type === 'file' && part.mediaType === 'application/pdf'),
    );

    if (!hasResumePdf && !message.text?.trim()) {
      console.log('[feishu-handler] empty input -> prompt');
      await thread.post('请发送一份候选人简历 PDF，我会立即开始筛选分析。');
      return;
    }

    console.log('[feishu-handler] running screening', { hasResumePdf });
    const stream = await runResumeScreening({ messages, enableThinking: true });

    // Feishu does not support editing text messages (their PATCH API only
    // accepts interactive cards), so chat-sdk's post+edit streaming
    // fallback fails with code 230001. Instead, await the full text and
    // post once.
    console.log('[feishu-handler] awaiting final text');
    const finalText = await stream.text;
    console.log('[feishu-handler] posting text', { textLen: finalText.length });
    await thread.post(finalText || '（无内容）');
    console.log('[feishu-handler] text posted');

    try {
      console.log('[feishu-handler] extracting report');
      const report = await extractResumeReport(finalText);
      const resumeCount = messages.reduce((acc, m) =>
        acc + m.parts.filter(p => p.type === 'file' && p.mediaType === 'application/pdf').length, 0);

      await thread.post(
        ResumeReportCard({ ...report, resumeCount }) as never,
      );
      console.log('[feishu-handler] card posted');
    }
    catch (cardError) {
      console.error('[feishu-handler] card extraction failed:', cardError);
    }
  }
  catch (error) {
    const stack = error instanceof Error ? error.stack : String(error);
    console.error('[feishu-handler] FAILED:', stack);
    try {
      await thread.post(`❌ 处理失败：${String(error)}`);
    }
    catch {
      // ignore
    }
  }
}
