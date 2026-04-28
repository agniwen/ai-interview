/* oxlint-disable class-methods-use-this -- Adapter methods implement an interface; some don't need `this`. */

/**
 * Feishu (Lark) adapter for chat-sdk.
 *
 * Uses Feishu Open Platform APIs for sending/receiving messages.
 * Webhook signature verification uses the encrypt key.
 *
 * @see https://open.feishu.cn/document/server-docs/getting-started/getting-started
 */

import type {
  Adapter,
  AdapterPostableMessage,
  Attachment,
  ChatInstance,
  EmojiValue,
  FetchOptions,
  FetchResult,
  FormattedContent,
  Logger,
  RawMessage,
  ThreadInfo,
  WebhookOptions,
} from "chat";
import type { FeishuAdapterConfig, FeishuEventCallback, FeishuThreadId } from "./types";
import crypto from "node:crypto";
import {
  extractCard,
  extractFiles,
  NetworkError,
  toBuffer,
  ValidationError,
} from "@chat-adapter/shared";
import { AppType, Client, Domain } from "@larksuiteoapi/node-sdk";
import { ConsoleLogger, convertEmojiPlaceholders, defaultEmojiResolver, Message } from "chat";
import { cardToFeishuPayload } from "./cards";
import { FeishuFormatConverter } from "./markdown";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

function normalizeFileSize(rawSize: unknown): number | undefined {
  if (typeof rawSize === "number") {
    return rawSize;
  }
  if (rawSize) {
    return Number(rawSize) || undefined;
  }
  return undefined;
}

export class FeishuAdapter implements Adapter<FeishuThreadId, unknown> {
  readonly name = "feishu";
  readonly userName: string;
  readonly botUserId?: string;

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly encryptKey?: string;
  private readonly verificationToken?: string;
  private chat: ChatInstance | null = null;
  private readonly logger: Logger;
  private readonly formatConverter = new FeishuFormatConverter();
  private readonly client: Client;

  constructor(config: FeishuAdapterConfig & { logger: Logger; userName?: string }) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.encryptKey = config.encryptKey;
    this.verificationToken = config.verificationToken;
    this.logger = config.logger;
    this.userName = config.userName ?? "bot";

    this.client = new Client({
      appId: this.appId,
      appSecret: this.appSecret,
      appType: AppType.SelfBuild,
      domain: Domain.Feishu,
    });
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;

    // Attempt to fetch bot info to get the bot's open_id
    try {
      const response = await this.feishuFetch("/bot/v3/info", "GET");
      const data = (await response.json()) as {
        bot?: { open_id?: string };
      };
      if (data.bot?.open_id) {
        (this as { botUserId?: string }).botUserId = data.bot.open_id;
      }
    } catch {
      this.logger.debug("Could not fetch bot info (bot user ID will not be available)");
    }

    this.logger.info("Feishu adapter initialized", {
      appId: this.appId,
      botUserId: this.botUserId ?? "(not available)",
    });
  }

  /**
   * Handle incoming Feishu webhook (event callback or URL verification challenge).
   */
  async handleWebhook(request: Request, _options?: WebhookOptions): Promise<Response> {
    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response("Failed to read body", { status: 400 });
    }

    let payload: FeishuEventCallback;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Decrypt event payload if encrypted
    if (payload.encrypt) {
      if (!this.encryptKey) {
        this.logger.warn("Received encrypted event but no encryptKey is configured");
        return new Response("Encryption key not configured", { status: 400 });
      }
      try {
        const decryptedJson = this.decryptEvent(payload.encrypt);
        payload = JSON.parse(decryptedJson);
      } catch (error) {
        this.logger.error("Failed to decrypt Feishu event", {
          error: String(error),
        });
        return new Response("Decryption failed", { status: 400 });
      }
    }

    // Verify event signature when present.
    // Feishu only includes x-lark-* signature headers for some events;
    // URL-verification challenges and many v2 event payloads ship encrypted
    // without signature headers, relying on the verification token inside
    // the decrypted payload for authenticity. Treat signature headers as
    // optional: verify when present, otherwise fall through to the token
    // check below.
    if (this.encryptKey) {
      const timestamp = request.headers.get("x-lark-request-timestamp");
      const nonce = request.headers.get("x-lark-request-nonce");
      const signature = request.headers.get("x-lark-signature");

      if (timestamp && nonce && signature) {
        const isValid = this.verifySignature(timestamp, nonce, body, signature);
        if (!isValid) {
          this.logger.warn("Feishu event signature verification failed");
          return new Response("Invalid signature", { status: 401 });
        }
      } else {
        this.logger.debug(
          "Feishu event has no signature headers; relying on encryption + verification token",
        );
      }
    }

    // Handle URL verification challenge
    // Note: challenge is checked after signature verification for security,
    // but challenge requests may arrive before encryptKey is configured.
    if (payload.challenge) {
      this.logger.info("Feishu URL verification challenge received");
      return Response.json({ challenge: payload.challenge });
    }

    // Verify token if configured (v1 and v2 events include a token)
    const eventToken = payload.header?.token ?? payload.token;
    if (this.verificationToken && eventToken !== this.verificationToken) {
      this.logger.warn("Feishu verification token mismatch");
      return new Response("Invalid token", { status: 401 });
    }

    // Handle v2 events (schema "2.0")
    const eventType = payload.header?.event_type ?? payload.type;
    this.logger.info("Feishu webhook received", {
      eventType,
      schema: payload.schema,
    });

    await this.dispatchEvent(payload, eventType, _options);

    return Response.json({ ok: true });
  }

  /**
   * Route a parsed Feishu event to the appropriate handler based on event type.
   * Extracted from handleWebhook to keep cyclomatic complexity in check.
   */
  private async dispatchEvent(
    payload: FeishuEventCallback,
    eventType: string | undefined,
    options: WebhookOptions | undefined,
  ): Promise<void> {
    if (eventType === "im.message.receive_v1" && payload.event) {
      await this.handleMessageEvent(payload);
    } else if (eventType === "card.action.trigger" && payload.event) {
      // 中文：卡片按钮点击 → 走 chat-sdk 的 processAction 分发到用户注册的 onAction
      // English: card button click → dispatch via chat-sdk's processAction
      await this.handleCardActionEvent(payload, options);
    }
  }

  /**
   * Handle an incoming message event.
   */
  private async handleMessageEvent(payload: FeishuEventCallback): Promise<void> {
    if (!(this.chat && payload.event)) {
      return;
    }

    const { event } = payload;
    const msg = event.message;
    const { sender } = event;

    // Skip messages from bots
    if (sender.sender_type === "app") {
      this.logger.debug("Ignoring message from app/bot", {
        senderId: sender.sender_id.open_id,
      });
      return;
    }

    const chatId = msg.chat_id;
    // For p2p (direct message) chats, encode the thread with the 'dm'
    // sentinel so chat-sdk's `isDM` check returns true and the
    // `onDirectMessage` handler fires. Replies in DM threads use
    // `client.im.message.create` (see sendToChat) which is correct for DMs.
    //
    // For group messages, use root_id when present (so replies in the same
    // thread share a threadId) or fall back to the message id itself as
    // the thread root.
    const isP2P = msg.chat_type === "p2p";
    const rootMessageId = isP2P ? "dm" : (msg.root_id ?? msg.message_id);

    // Capture Feishu topic thread_id (omt_xxx) for fetching thread messages later
    const feishuThreadId = isP2P ? undefined : msg.thread_id;
    const threadId = this.encodeThreadId({
      chatId,
      messageId: rootMessageId,
      threadId: feishuThreadId,
    });

    // Parse content
    const textContent = this.extractTextFromContent(msg.message_type, msg.content);

    const attachments = this.extractAttachmentsFromContent(
      msg.message_id,
      msg.message_type,
      msg.content,
    );

    // Check if bot is mentioned
    const isMentioned = msg.mentions?.some((m) => m.id.open_id === this.botUserId) ?? false;

    // Strip mention tags from text for clean display
    let cleanText = textContent;
    if (msg.mentions) {
      for (const mention of msg.mentions) {
        cleanText = cleanText.replace(mention.key, `@${mention.name}`);
      }
    }

    const chatMessage = new Message({
      attachments,
      author: {
        fullName: sender.sender_id.open_id,
        isBot: false,
        isMe: sender.sender_id.open_id === this.botUserId,
        userId: sender.sender_id.open_id,
        userName: sender.sender_id.open_id,
      },
      formatted: this.formatConverter.toAst(cleanText),
      id: msg.message_id,
      isMention: isMentioned,
      metadata: {
        dateSent: new Date(Number(msg.create_time)),
        edited: false,
      },
      raw: payload,
      text: cleanText,
      threadId,
    });

    try {
      await this.chat.handleIncomingMessage(this, threadId, chatMessage);
    } catch (error) {
      this.logger.error("Error handling Feishu message", {
        error: String(error),
        messageId: msg.message_id,
      });
    }
  }

  /**
   * Handle a card-button click event from Feishu (card.action.trigger).
   * Translates the Feishu payload into a chat-sdk ActionEvent and forwards
   * it to chat.processAction, which routes to user-registered onAction handlers.
   *
   * Field paths captured in __fixtures__/card-action-event.json. Currently
   * assumes DM context; group-chat card actions (Workflow 3) will require
   * a different threadId encoding, which can be added when needed.
   */
  private async handleCardActionEvent(
    payload: FeishuEventCallback,
    options: WebhookOptions | undefined,
  ): Promise<void> {
    if (!this.chat) {
      this.logger.warn("Card action received but chat not attached");
      return;
    }
    const event = payload.event as Record<string, unknown> | undefined;
    if (!event) {
      return;
    }

    const action = (event.action as Record<string, unknown> | undefined) ?? {};
    const actionValue = (action.value as Record<string, unknown> | undefined) ?? {};
    const operator = (event.operator as Record<string, unknown> | undefined) ?? {};
    const context = (event.context as Record<string, unknown> | undefined) ?? {};

    const actionId = String(actionValue.action_id ?? "");
    if (!actionId) {
      this.logger.warn("Card action missing action_id; skipping");
      return;
    }
    const userValue = actionValue.value === undefined ? undefined : String(actionValue.value);
    const openId = String(operator.open_id ?? "");
    const chatId = String(context.open_chat_id ?? "");
    const messageId = String(context.open_message_id ?? "");
    const userName = String(operator.user_name ?? operator.name ?? "");

    if (!chatId) {
      this.logger.warn("Card action missing chat_id; cannot reconstruct thread", {
        actionId,
      });
      return;
    }

    // 中文：当前只支持 DM 场景；群聊卡片按钮的 thread 编码 Workflow 3 再补
    // English: DM only for now; group-chat card thread encoding will be added in Workflow 3
    const threadId = this.encodeThreadId({ chatId, messageId: "dm" });

    await this.chat.processAction(
      {
        actionId,
        adapter: this,
        messageId,
        raw: payload,
        threadId,
        user: {
          fullName: userName,
          isBot: false,
          isMe: false,
          userId: openId,
          userName,
        },
        value: userValue,
      },
      options,
    );
  }

  /**
   * Post a message to a Feishu chat or reply to a thread.
   */
  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<unknown>> {
    const { chatId, messageId: rootMessageId } = this.decodeThreadId(threadId);

    // Build message content
    const { content, msgType } = this.buildMessagePayload(message);

    // Handle file uploads
    const files = extractFiles(message);
    if (files.length > 0) {
      return this.postMessageWithFiles(threadId, chatId, rootMessageId, files);
    }

    this.logger.debug("Feishu API: POST message", {
      chatId,
      msgType,
      rootMessageId,
    });

    try {
      const response = await this.sendToChat(chatId, rootMessageId, content, msgType);

      const messageId =
        (response as { data?: { message_id?: string } }).data?.message_id ?? "unknown";

      this.logger.debug("Feishu API: POST message response", {
        messageId,
      });

      return {
        id: messageId,
        raw: response,
        threadId,
      };
    } catch (error) {
      this.logger.error("Feishu API: POST message error", {
        error: String(error),
      });
      throw new NetworkError("feishu", `Failed to post message: ${String(error)}`);
    }
  }

  /**
   * Build message payload from an AdapterPostableMessage.
   */
  private buildMessagePayload(message: AdapterPostableMessage): {
    content: string;
    msgType: string;
  } {
    // Check for card
    const card = extractCard(message);
    if (card) {
      const cardPayload = cardToFeishuPayload(card);
      return {
        content: JSON.stringify(cardPayload),
        msgType: "interactive",
      };
    }

    // Regular text message
    const text = convertEmojiPlaceholders(this.formatConverter.renderPostable(message), "gchat");

    return {
      content: JSON.stringify({ text }),
      msgType: "text",
    };
  }

  /**
   * Send a message to a chat — uses `create` for DM threads (messageId === "dm")
   * and `reply` for regular threads.
   */
  private sendToChat(
    chatId: string,
    rootMessageId: string,
    content: string,
    msgType: string,
  ): Promise<unknown> {
    if (rootMessageId === "dm") {
      return this.client.im.message.create({
        data: {
          content,
          msg_type: msgType,
          receive_id: chatId,
        },
        params: { receive_id_type: "chat_id" },
      });
    }

    return this.client.im.message.reply({
      data: {
        content,
        msg_type: msgType,
      },
      path: { message_id: rootMessageId },
    });
  }

  /**
   * Post a message with file attachments.
   * Feishu requires uploading files first, then sending them as image/file messages.
   */
  private async postMessageWithFiles(
    threadId: string,
    chatId: string,
    rootMessageId: string,
    files: {
      filename: string;
      data: Buffer | Blob | ArrayBuffer;
      mimeType?: string;
    }[],
  ): Promise<RawMessage<unknown>> {
    const [file] = files;
    if (!file) {
      throw new NetworkError("feishu", "No files to upload");
    }

    // Warn if multiple files were provided since Feishu only supports one attachment per message
    if (files.length > 1) {
      this.logger.warn(
        `Feishu only supports one attachment per message. Sending first file only, ${files.length - 1} file(s) dropped: ${files
          .slice(1)
          .map((f) => f.filename)
          .join(", ")}`,
      );
    }

    const buffer = await toBuffer(file.data, {
      platform: "feishu" as "slack",
    });
    if (!buffer) {
      throw new NetworkError("feishu", "Failed to convert file to buffer");
    }

    const isImage = file.mimeType?.startsWith("image/") ?? false;

    try {
      // Upload the file/image first
      let imageKey: string | undefined;
      if (isImage) {
        const uploadResponse = await this.client.im.image.create({
          data: {
            image: Buffer.from(buffer),
            image_type: "message",
          },
        });
        imageKey = (uploadResponse as { data?: { image_key?: string } }).data?.image_key;
      }

      // Send message with the uploaded content
      const content =
        isImage && imageKey
          ? JSON.stringify({ image_key: imageKey })
          : JSON.stringify({ text: `[File: ${file.filename}]` });

      const msgType = isImage && imageKey ? "image" : "text";

      const response = await this.sendToChat(chatId, rootMessageId, content, msgType);

      const messageId =
        (response as { data?: { message_id?: string } }).data?.message_id ?? "unknown";

      return {
        id: messageId,
        raw: response,
        threadId,
      };
    } catch (error) {
      throw new NetworkError("feishu", `Failed to upload file: ${String(error)}`);
    }
  }

  /**
   * Edit an existing Feishu message.
   */
  async editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<unknown>> {
    const { content, msgType } = this.buildMessagePayload(message);

    this.logger.debug("Feishu API: PATCH message", {
      messageId,
      msgType,
    });

    try {
      const response = await this.client.im.message.patch({
        data: { content },
        path: { message_id: messageId },
      });

      this.logger.debug("Feishu API: PATCH message response", {
        messageId,
      });

      return {
        id: messageId,
        raw: response,
        threadId,
      };
    } catch (error) {
      throw new NetworkError("feishu", `Failed to edit message: ${String(error)}`);
    }
  }

  /**
   * Delete a Feishu message.
   */
  async deleteMessage(_threadId: string, messageId: string): Promise<void> {
    this.logger.debug("Feishu API: DELETE message", { messageId });

    try {
      await this.client.im.message.delete({
        path: { message_id: messageId },
      });
      this.logger.debug("Feishu API: DELETE message response", { ok: true });
    } catch (error) {
      throw new NetworkError("feishu", `Failed to delete message: ${String(error)}`);
    }
  }

  /**
   * Add a reaction to a Feishu message.
   */
  async addReaction(
    _threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
  ): Promise<void> {
    const emojiType = this.resolveEmojiType(emoji);

    this.logger.debug("Feishu API: POST reaction", {
      emojiType,
      messageId,
    });

    try {
      await this.client.im.messageReaction.create({
        data: {
          reaction_type: { emoji_type: emojiType },
        },
        path: { message_id: messageId },
      });
      this.logger.debug("Feishu API: POST reaction response", { ok: true });
    } catch (error) {
      this.logger.error("Feishu API: POST reaction error", {
        error: String(error),
      });
      throw new NetworkError("feishu", `Failed to add reaction: ${String(error)}`);
    }
  }

  /**
   * Remove a reaction from a Feishu message.
   */
  async removeReaction(
    _threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
  ): Promise<void> {
    const emojiType = this.resolveEmojiType(emoji);

    this.logger.debug("Feishu API: DELETE reaction", {
      emojiType,
      messageId,
    });

    try {
      // List reactions on the message to find the correct reaction_id (UUID)
      // Feishu API requires a UUID reaction_id for deletion, not the emoji type string
      const listResponse = await this.client.im.messageReaction.list({
        params: { reaction_type: emojiType },
        path: { message_id: messageId },
      });

      const items =
        (
          listResponse as {
            data?: {
              items?: {
                reaction_id?: string;
                reaction_type?: { emoji_type?: string };
              }[];
            };
          }
        ).data?.items ?? [];

      // Find a reaction matching the emoji type (prefer our bot's reaction)
      const match = items.find((item) => item.reaction_type?.emoji_type === emojiType);

      if (!match?.reaction_id) {
        this.logger.warn("Feishu API: No matching reaction found to remove", {
          emojiType,
          messageId,
        });
        return;
      }

      await this.client.im.messageReaction.delete({
        path: {
          message_id: messageId,
          reaction_id: match.reaction_id,
        },
      });
      this.logger.debug("Feishu API: DELETE reaction response", { ok: true });
    } catch (error) {
      this.logger.error("Feishu API: DELETE reaction error", {
        error: String(error),
      });
      throw new NetworkError("feishu", `Failed to remove reaction: ${String(error)}`);
    }
  }

  /**
   * Start typing indicator. Feishu does not have a typing API, so this is a no-op.
   */
  async startTyping(_threadId: string, _status?: string): Promise<void> {
    // No-op: Feishu does not support typing indicators
  }

  /**
   * Fetch messages from a Feishu thread.
   */
  async fetchMessages(threadId: string, options: FetchOptions = {}): Promise<FetchResult<unknown>> {
    const {
      chatId,
      messageId: rootMessageId,
      threadId: feishuThreadId,
    } = this.decodeThreadId(threadId);
    const limit = options.limit ?? 50;
    const isDM = rootMessageId === "dm";
    // For group threads: use omt_ thread ID with container_id_type 'thread' if available,
    // otherwise fall back to chat-level fetch and filter client-side by root_id
    const useThreadContainer = !isDM && !!feishuThreadId;

    this.logger.debug("Feishu API: GET messages", {
      chatId,
      cursor: options.cursor,
      feishuThreadId,
      isDM,
      limit,
      rootMessageId,
      useThreadContainer,
    });

    try {
      let containerIdType: string;
      let containerId: string;
      if (useThreadContainer) {
        containerIdType = "thread";
        containerId = feishuThreadId;
      } else {
        containerIdType = "chat";
        containerId = chatId;
      }

      const response = await this.client.im.message.list({
        params: {
          container_id: containerId,
          container_id_type: containerIdType,
          page_size: limit,
          page_token: options.cursor,
          sort_type: "ByCreateTimeDesc",
        },
      });

      const data = response as {
        data?: {
          items?: {
            message_id: string;
            root_id?: string;
            parent_id?: string;
            create_time: string;
            update_time?: string;
            chat_id: string;
            msg_type: string;
            body?: { content?: string };
            sender: { id: string; sender_type: string };
          }[];
          page_token?: string;
          has_more?: boolean;
        };
      };

      let items = data.data?.items ?? [];

      // Sort by create_time ascending (chronological order) regardless of API sort_type
      items.sort((a, b) => Number(a.create_time) - Number(b.create_time));

      // When fetching at chat level for a group thread (no omt_ thread ID),
      // filter to only messages belonging to the same root thread
      if (!isDM && !useThreadContainer && rootMessageId) {
        items = items.filter(
          (item) => item.message_id === rootMessageId || item.root_id === rootMessageId,
        );
      }

      const messages = items.map((item) => {
        const content = item.body?.content ?? "";
        const text = this.extractTextFromContent(item.msg_type, content);
        // Bot sender uses app_id (cli_xxx) in API responses, not open_id (ou_xxx)
        const isMe = item.sender.sender_type === "app" && item.sender.id === this.appId;

        return new Message({
          attachments: this.extractAttachmentsFromContent(item.message_id, item.msg_type, content),
          author: {
            fullName: item.sender.id,
            isBot: item.sender.sender_type === "app",
            isMe,
            userId: item.sender.id,
            userName: item.sender.id,
          },
          formatted: this.formatConverter.toAst(text),
          id: item.message_id,
          metadata: {
            dateSent: new Date(Number(item.create_time)),
            edited: !!item.update_time,
            editedAt: item.update_time ? new Date(Number(item.update_time)) : undefined,
          },
          raw: item,
          text,
          threadId,
        });
      });

      return {
        messages,
        nextCursor: data.data?.has_more ? data.data.page_token : undefined,
      };
    } catch (error) {
      this.logger.error("Feishu API: GET messages error", {
        error: String(error),
      });
      throw new NetworkError("feishu", `Failed to fetch messages: ${String(error)}`);
    }
  }

  /**
   * Fetch thread/chat information.
   */
  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { chatId } = this.decodeThreadId(threadId);

    this.logger.debug("Feishu API: GET chat info", { chatId });

    try {
      const response = await this.client.im.chat.get({
        path: { chat_id: chatId },
      });

      const data = response as {
        data?: {
          name?: string;
          chat_mode?: string;
        };
      };

      return {
        channelId: chatId,
        channelName: data.data?.name,
        id: threadId,
        isDM: data.data?.chat_mode === "p2p",
        metadata: {
          raw: response,
        },
      };
    } catch (error) {
      this.logger.error("Feishu API: GET chat info error", {
        error: String(error),
      });
      throw new NetworkError("feishu", `Failed to fetch thread info: ${String(error)}`);
    }
  }

  /**
   * Open a DM with a user.
   */
  async openDM(userId: string): Promise<string> {
    this.logger.debug("Feishu API: POST create p2p chat", { userId });

    try {
      const response = await this.client.im.chat.create({
        data: {
          chat_mode: "p2p",
          user_id_list: [userId],
        },
        params: { user_id_type: "open_id" },
      });

      const chatId = (response as { data?: { chat_id?: string } }).data?.chat_id;
      if (!chatId) {
        throw new NetworkError("feishu", "Failed to create DM: no chat_id");
      }

      this.logger.debug("Feishu API: POST create p2p chat response", {
        chatId,
      });

      // For DM, the thread ID uses the chat_id and a placeholder message_id
      return this.encodeThreadId({
        chatId,
        messageId: "dm",
      });
    } catch (error) {
      throw new NetworkError("feishu", `Failed to open DM: ${String(error)}`);
    }
  }

  /**
   * Check if a thread is a DM.
   */
  isDM(threadId: string): boolean {
    const { messageId } = this.decodeThreadId(threadId);
    return messageId === "dm";
  }

  /**
   * Extract plain text from a Feishu message content string.
   * Supports `text` and `post` (rich text) message types.
   */
  private extractTextFromContent(msgType: string, content: string): string {
    try {
      if (msgType === "text") {
        const parsed = JSON.parse(content) as { text?: string };
        return parsed.text ?? "";
      }
      if (msgType === "post") {
        const parsed = JSON.parse(content) as Record<
          string,
          {
            title?: string;
            content?: { tag: string; text?: string }[][];
          }
        >;
        // post content is keyed by locale (zh_cn, en_us, etc.), pick the first available
        const [locale] = Object.values(parsed);
        if (!locale?.content) {
          return locale?.title ?? "";
        }
        const segments: string[] = [];
        if (locale.title) {
          segments.push(locale.title);
        }
        for (const line of locale.content) {
          const lineText = line
            .filter((node) => node.text)
            .map((node) => node.text)
            .join("");
          if (lineText) {
            segments.push(lineText);
          }
        }
        return segments.join("\n");
      }
    } catch {
      // Content parsing failure is non-fatal
    }
    return "";
  }

  /**
   * Encode platform data into a thread ID string.
   * Format: feishu:{chatId}:{messageId}
   */
  encodeThreadId(platformData: FeishuThreadId): string {
    const base = `feishu:${platformData.chatId}:${platformData.messageId}`;
    // Append omt_ thread ID as 4th segment when available
    return platformData.threadId ? `${base}:${platformData.threadId}` : base;
  }

  /**
   * Decode thread ID string back to platform data.
   */
  decodeThreadId(threadId: string): FeishuThreadId {
    const parts = threadId.split(":");
    if (parts.length < 3 || parts[0] !== "feishu") {
      throw new ValidationError("feishu", `Invalid Feishu thread ID: ${threadId}`);
    }

    return {
      chatId: parts[1] as string,
      messageId: parts[2] as string,
      threadId: parts[3] || undefined,
    };
  }

  /**
   * Derive channel ID from a Feishu thread ID.
   * feishu:{chatId}:{messageId} -> feishu:{chatId}
   */
  channelIdFromThreadId(threadId: string): string {
    const parts = threadId.split(":");
    return parts.slice(0, 2).join(":");
  }

  /**
   * Parse a Feishu message into normalized format.
   */
  parseMessage(raw: unknown): Message<unknown> {
    const msg = raw as {
      message_id: string;
      chat_id: string;
      root_id?: string;
      content: string;
      msg_type: string;
      create_time: string;
      update_time?: string;
      sender: { id: string; sender_type: string };
    };

    const chatId = msg.chat_id;
    const rootMessageId = msg.root_id ?? msg.message_id;
    const threadId = this.encodeThreadId({ chatId, messageId: rootMessageId });

    const text = this.extractTextFromContent(msg.msg_type, msg.content);

    return new Message({
      attachments: this.extractAttachmentsFromContent(msg.message_id, msg.msg_type, msg.content),
      author: {
        fullName: msg.sender.id,
        isBot: msg.sender.sender_type === "app",
        isMe: msg.sender.id === this.botUserId,
        userId: msg.sender.id,
        userName: msg.sender.id,
      },
      formatted: this.formatConverter.toAst(text),
      id: msg.message_id,
      metadata: {
        dateSent: new Date(Number(msg.create_time)),
        edited: !!msg.update_time,
        editedAt: msg.update_time ? new Date(Number(msg.update_time)) : undefined,
      },
      raw,
      text,
      threadId,
    });
  }

  /**
   * Render formatted content to Feishu markdown.
   */
  renderFormatted(content: FormattedContent): string {
    return this.formatConverter.fromAst(content);
  }

  /**
   * Extract attachments from a Feishu message content JSON string.
   * Supports `file` and `image` message types. Returns an empty array
   * for unsupported types or if parsing fails.
   *
   * The returned attachments use a lazy `fetchData` callback that downloads
   * the binary via the message resource API on demand.
   */
  private extractAttachmentsFromContent(
    messageId: string,
    messageType: string,
    rawContent: string,
  ): Attachment[] {
    if (messageType !== "file" && messageType !== "image") {
      return [];
    }

    let parsed: {
      file_key?: string;
      file_name?: string;
      image_key?: string;
      file_size?: number | string;
    };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.logger.debug("Failed to parse Feishu file/image content", {
        messageId,
        messageType,
      });
      return [];
    }

    if (messageType === "file") {
      const fileKey = parsed.file_key;
      if (!fileKey) {
        return [];
      }
      return [
        {
          fetchData: () => this.downloadMessageResource(messageId, fileKey, "file"),
          mimeType: this.guessMimeType(parsed.file_name),
          name: parsed.file_name,
          size: normalizeFileSize(parsed.file_size),
          type: "file",
        },
      ];
    }

    // image
    const imageKey = parsed.image_key;
    if (!imageKey) {
      return [];
    }
    return [
      {
        fetchData: () => this.downloadMessageResource(messageId, imageKey, "image"),
        mimeType: "image/png",
        type: "image",
      },
    ];
  }

  /**
   * Best-effort MIME type guess from filename extension.
   */
  private guessMimeType(filename?: string): string | undefined {
    if (!filename) {
      return undefined;
    }
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
      case "pdf": {
        return "application/pdf";
      }
      case "doc": {
        return "application/msword";
      }
      case "docx": {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
      case "xls": {
        return "application/vnd.ms-excel";
      }
      case "xlsx": {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      case "png": {
        return "image/png";
      }
      case "jpg":
      case "jpeg": {
        return "image/jpeg";
      }
      case "txt": {
        return "text/plain";
      }
      default: {
        return undefined;
      }
    }
  }

  /**
   * Download the binary payload for a message resource (file or image)
   * via the Feishu Open Platform API.
   *
   * @see https://open.feishu.cn/document/server-docs/im-v1/message/get-2
   */
  private async downloadMessageResource(
    messageId: string,
    fileKey: string,
    type: "file" | "image",
  ): Promise<Buffer> {
    const path = `/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${type}`;
    const response = await this.feishuFetch(path, "GET");
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  }

  /**
   * Decrypt an encrypted event payload using AES-256-CBC.
   * Algorithm matches the official Feishu SDK:
   * 1. Key = SHA-256 hash of the encryptKey string
   * 2. Ciphertext = Base64-decoded encrypt string
   * 3. IV = first 16 bytes of ciphertext
   * 4. Decrypt remaining bytes with AES-256-CBC
   *
   * @see https://github.com/larksuite/node-sdk/blob/main/utils/aes-cipher.ts
   */
  private decryptEvent(encryptedString: string): string {
    if (!this.encryptKey) {
      throw new Error("encryptKey is required for decryption");
    }

    const hash = crypto.createHash("sha256");
    hash.update(this.encryptKey);
    const key = hash.digest();

    const encryptBuffer = Buffer.from(encryptedString, "base64");
    const iv = encryptBuffer.subarray(0, 16);
    const ciphertext = encryptBuffer.subarray(16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(ciphertext.toString("hex"), "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  }

  /**
   * Verify the event signature using SHA-256.
   * Formula: sha256(timestamp + nonce + encryptKey + body)
   *
   * @see https://github.com/larksuite/node-sdk/blob/main/dispatcher/request-handle.ts
   */
  private verifySignature(
    timestamp: string,
    nonce: string,
    body: string,
    expectedSignature: string,
  ): boolean {
    if (!this.encryptKey) {
      return true;
    }

    const content = timestamp + nonce + this.encryptKey + body;
    const computedSignature = crypto.createHash("sha256").update(content).digest("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  /**
   * Resolve an emoji value to a Feishu emoji type string.
   */
  private resolveEmojiType(emoji: EmojiValue | string): string {
    // Convert to unicode emoji for Feishu (gchat resolver returns unicode)
    return defaultEmojiResolver.toGChat(emoji);
  }

  /**
   * Make authenticated requests to Feishu API.
   */
  private async feishuFetch(path: string, method: string, body?: unknown): Promise<Response> {
    // Get tenant access token
    const tokenResponse = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const tokenData = (await tokenResponse.json()) as {
      tenant_access_token?: string;
    };
    const token = tokenData.tenant_access_token;
    if (!token) {
      throw new NetworkError("feishu", "Failed to obtain tenant access token");
    }

    const url = `${FEISHU_API_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers,
      method,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("Feishu API error", {
        error: errorText,
        method,
        path,
        status: response.status,
      });
      throw new NetworkError("feishu", `Feishu API error: ${response.status} ${errorText}`);
    }

    return response;
  }
}

/**
 * Create a Feishu adapter instance.
 */
export function createFeishuAdapter(
  config?: Partial<FeishuAdapterConfig & { logger: Logger; userName?: string }>,
): FeishuAdapter {
  const appId = config?.appId ?? process.env.FEISHU_APP_ID;
  if (!appId) {
    throw new ValidationError(
      "feishu",
      "appId is required. Set FEISHU_APP_ID or provide it in config.",
    );
  }
  const appSecret = config?.appSecret ?? process.env.FEISHU_APP_SECRET;
  if (!appSecret) {
    throw new ValidationError(
      "feishu",
      "appSecret is required. Set FEISHU_APP_SECRET or provide it in config.",
    );
  }
  const encryptKey = config?.encryptKey ?? process.env.FEISHU_ENCRYPT_KEY;
  const verificationToken = config?.verificationToken ?? process.env.FEISHU_VERIFICATION_TOKEN;

  const resolved: FeishuAdapterConfig & {
    logger: Logger;
    userName?: string;
  } = {
    appId,
    appSecret,
    encryptKey,
    logger: config?.logger ?? new ConsoleLogger("info").child("feishu"),
    userName: config?.userName,
    verificationToken,
  };
  return new FeishuAdapter(resolved);
}

// Re-export card converter for advanced use
export { cardToFallbackText, cardToFeishuPayload } from "./cards";

// Re-export format converter for advanced use
export {
  FeishuFormatConverter,
  FeishuFormatConverter as FeishuMarkdownConverter,
} from "./markdown";

// Re-export types
export type { FeishuAdapterConfig, FeishuThreadId } from "./types";
