/**
 * Feishu Interactive Card converter for cross-platform cards.
 *
 * Converts CardElement to Feishu Interactive Card format.
 * @see https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components
 */

/* oxlint-disable no-use-before-define -- Card element converters call each other recursively (processChild ↔ processSectionElement). */

import type {
  ActionsElement,
  ButtonElement,
  CardChild,
  CardElement,
  FieldsElement,
  LinkButtonElement,
  SectionElement,
  TextElement,
} from "chat";
import type {
  FeishuCardActionElement,
  FeishuCardButtonElement,
  FeishuCardElement,
  FeishuInteractiveCard,
} from "./types";
import { convertEmojiPlaceholders } from "chat";

/**
 * Convert emoji placeholders to Feishu format.
 * Feishu doesn't have a specific emoji format, so we use Unicode.
 */
function convertEmoji(text: string): string {
  return convertEmojiPlaceholders(text, "gchat");
}

/**
 * Feishu card header background colors.
 * @see https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/title
 */
export type FeishuHeaderTemplate =
  | "blue"
  | "green"
  | "grey"
  | "indigo"
  | "orange"
  | "purple"
  | "red"
  | "turquoise"
  | "wathet"
  | "yellow";

export interface CardToFeishuPayloadOptions {
  /** Override the card header background color. Defaults to `blue`. */
  headerTemplate?: FeishuHeaderTemplate;
}

/**
 * Convert a CardElement to a Feishu Interactive Card payload.
 */
export function cardToFeishuPayload(
  card: CardElement,
  options: CardToFeishuPayloadOptions = {},
): FeishuInteractiveCard {
  const result: FeishuInteractiveCard = {
    config: {
      wide_screen_mode: true,
    },
    elements: [],
  };

  // Set header if title is present
  if (card.title) {
    result.header = {
      template: options.headerTemplate ?? "blue",
      title: {
        content: convertEmoji(card.title),
        tag: "plain_text",
      },
    };
  }

  // Process subtitle as a text div element
  if (card.subtitle) {
    result.elements.push({
      tag: "div",
      text: {
        content: convertEmoji(card.subtitle),
        tag: "lark_md",
      },
    });
  }

  // Process children
  for (const child of card.children) {
    const elements = processChild(child);
    result.elements.push(...elements);
  }

  return result;
}

/**
 * Process a card child element into Feishu card elements.
 */
function processChild(child: CardChild): FeishuCardElement[] {
  switch (child.type) {
    case "text": {
      return [convertTextElement(child)];
    }
    case "image": {
      // Feishu card images require an image_key from the upload API.
      // External URLs are not directly supported in cards, so we skip.
      return [];
    }
    case "divider": {
      return [{ tag: "hr" }];
    }
    case "actions": {
      return convertActionsElement(child);
    }
    case "section": {
      return processSectionElement(child);
    }
    case "fields": {
      return convertFieldsElement(child);
    }
    default: {
      return [];
    }
  }
}

/**
 * Convert a text element to a Feishu card div element.
 */
function convertTextElement(element: TextElement): FeishuCardElement {
  let text = convertEmoji(element.content);

  // Apply style
  if (element.style === "bold") {
    text = `**${text}**`;
  } else if (element.style === "muted") {
    // Feishu doesn't have muted, use italic as approximation
    text = `*${text}*`;
  }

  return {
    tag: "div",
    text: {
      content: text,
      tag: "lark_md",
    },
  };
}

/**
 * Convert an actions element to Feishu card action elements.
 */
function convertActionsElement(element: ActionsElement): FeishuCardElement[] {
  const buttons: FeishuCardButtonElement[] = element.children
    .filter((child) => child.type === "button" || child.type === "link-button")
    .map((button) => {
      if (button.type === "link-button") {
        return convertLinkButtonElement(button);
      }
      return convertButtonElement(button);
    });

  if (buttons.length === 0) {
    return [];
  }

  const actionElement: FeishuCardActionElement = {
    actions: buttons,
    tag: "action",
  };

  return [actionElement];
}

/**
 * Convert a button element to a Feishu card button.
 */
function convertButtonElement(button: ButtonElement): FeishuCardButtonElement {
  // 中文：把 user 提供的 value 一并塞进飞书的 value 对象，便于回调时取回
  // English: thread Button.value through Feishu's value object so click callbacks can read it
  const value: Record<string, string> = { action_id: button.id };
  if (button.value !== undefined) {
    value.value = button.value;
  }
  return {
    tag: "button",
    text: {
      content: button.label,
      tag: "plain_text",
    },
    type: getButtonType(button.style),
    value,
  };
}

/**
 * Convert a link button element to a Feishu card button with URL.
 */
function convertLinkButtonElement(button: LinkButtonElement): FeishuCardButtonElement {
  return {
    tag: "button",
    text: {
      content: button.label,
      tag: "plain_text",
    },
    type: "default",
    url: button.url,
  };
}

/**
 * Map button style to Feishu button type.
 */
function getButtonType(style?: ButtonElement["style"]): FeishuCardButtonElement["type"] {
  switch (style) {
    case "primary": {
      return "primary";
    }
    case "danger": {
      return "danger";
    }
    default: {
      return "default";
    }
  }
}

/**
 * Process a section element into Feishu card elements.
 */
function processSectionElement(element: SectionElement): FeishuCardElement[] {
  const elements: FeishuCardElement[] = [];
  for (const child of element.children) {
    elements.push(...processChild(child));
  }
  return elements;
}

/**
 * Convert fields element to Feishu card div elements.
 * Feishu cards don't have a native fields layout, so we render as markdown text.
 */
function convertFieldsElement(element: FieldsElement): FeishuCardElement[] {
  const fieldLines = element.children
    .map((field) => `**${convertEmoji(field.label)}**: ${convertEmoji(field.value)}`)
    .join("\n");

  return [
    {
      tag: "div",
      text: {
        content: fieldLines,
        tag: "lark_md",
      },
    },
  ];
}

/**
 * Generate fallback text from a card element.
 * Used when cards aren't supported or for notifications.
 */
export function cardToFallbackText(card: CardElement): string {
  const parts: string[] = [];

  if (card.title) {
    parts.push(`**${convertEmoji(card.title)}**`);
  }

  if (card.subtitle) {
    parts.push(convertEmoji(card.subtitle));
  }

  for (const child of card.children) {
    const text = childToFallbackText(child);
    if (text) {
      parts.push(text);
    }
  }

  return parts.join("\n\n");
}

/**
 * Convert a card child element to fallback text.
 */
function childToFallbackText(child: CardChild): string | null {
  switch (child.type) {
    case "text": {
      return convertEmoji(child.content);
    }
    case "fields": {
      return child.children
        .map((f) => `**${convertEmoji(f.label)}**: ${convertEmoji(f.value)}`)
        .join("\n");
    }
    case "actions": {
      // Actions are interactive-only - exclude from fallback text.
      return null;
    }
    case "section": {
      return child.children
        .map((c) => childToFallbackText(c))
        .filter(Boolean)
        .join("\n");
    }
    case "divider": {
      return "---";
    }
    default: {
      return null;
    }
  }
}
