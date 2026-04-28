# Card Action Event Fixture

Captured from a real Feishu card-button click during Plan 1.5 Task 1 (commit history). All identifying values (`tenant_key`, `app_id`, `open_id`, `union_id`, `chat_id`, `message_id`, event/operator tokens) have been redacted.

## Field paths used by `handleCardActionEvent`

| chat-sdk `ActionEvent` field | Feishu payload path                              |
| ---------------------------- | ------------------------------------------------ |
| `actionId`                   | `event.action.value.action_id`                   |
| `value` (user-supplied)      | `event.action.value.value` _(see note below)_    |
| `user.userId` (open_id)      | `event.operator.open_id`                         |
| `messageId`                  | `event.context.open_message_id`                  |
| chat_id (for thread lookup)  | `event.context.open_chat_id`                     |
| Feishu callback token        | `event.token` _(used for async card-update API)_ |

## Event type

The header's `event_type` is exactly `"card.action.trigger"` (no `_v1` suffix). The dispatcher in `handleWebhook` matches on this string.

## Note on `event.action.value.value`

The captured live event did NOT include a `value` subfield because, at capture time, the adapter's `convertButtonElement` was dropping `Button.value` on render (this is the bug Plan 1.5 Task 2 fixes). The fixture includes a synthetic `"value": "jd-synthetic-1"` so the Task 3 test can assert the round-trip works once Task 2 ships. Once both tasks are merged, real captured payloads will look like this fixture.

## Response shape

The adapter returns `Response.json({ ok: true })` to all webhook events including card actions, and Feishu accepts that. We do NOT return `{toast: ...}` or `{card: ...}` — the bot's reaction is delivered as a separate `thread.post(...)` from the `onAction` handler, which is enough for the Workflow 1 / 3 button UX.

## How to refresh this fixture

If Feishu changes the payload shape:

1. In `packages/adapter-feishu/src/index.ts`, temporarily add a `this.logger.warn("UNHANDLED FEISHU EVENT", { ..., rawPayload: JSON.stringify(payload) })` in `handleWebhook` for non-message events.
2. Run `pnpm dev` + cloudflared, click a button in real Feishu, capture the `rawPayload` from the dev console.
3. Replace this fixture's contents with the new capture, redacting `tenant_key`, `app_id`, `open_id`, `union_id`, `chat_id`, `message_id`, and tokens.
4. Update this doc if any field path changed.
