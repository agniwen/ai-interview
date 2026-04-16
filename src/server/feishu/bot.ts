import { createPostgresState } from '@chat-adapter/state-pg';
import { createFeishuAdapter } from '@repo/adapter-feishu';
import { Chat } from 'chat';
import { handleResumeMessage } from './handler';

let cached: Chat<{ feishu: ReturnType<typeof createFeishuAdapter> }> | null = null;

/**
 * Lazily construct the Feishu Chat instance. Uses a module-level cache
 * so a single instance is shared across requests in the same process.
 *
 * Throws (via createFeishuAdapter) if FEISHU_APP_ID / FEISHU_APP_SECRET
 * are missing, so callers should only invoke this from request paths
 * (not at import time).
 */
export function getFeishuBot() {
  if (cached) {
    return cached;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the Feishu bot state adapter');
  }

  const bot = new Chat({
    userName: 'resume-bot',
    adapters: {
      feishu: createFeishuAdapter({ userName: 'resume-bot' }),
    },
    state: createPostgresState({ url: databaseUrl }),
    dedupeTtlMs: 600_000,
    concurrency: 'queue',
  });

  bot.onDirectMessage(async (thread, message, _channel, context) => {
    await thread.subscribe();
    await handleResumeMessage(thread, message, context);
  });

  // Group chat handlers disabled for now — only DM is active

  cached = bot;
  return bot;
}
