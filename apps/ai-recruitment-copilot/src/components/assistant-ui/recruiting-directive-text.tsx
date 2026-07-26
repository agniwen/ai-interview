"use client";

/**
 * PROTOTYPE — render assistant-ui mention directives as chips in user messages
 * and in the Lexical composer (`directiveChip`).
 */

import type { TextMessagePartComponent } from "@assistant-ui/react";
import type { DirectiveChipProps } from "@assistant-ui/react-lexical";
import { Fragment } from "react";
import type { ReactNode } from "react";

const DIRECTIVE_RE = /:([\w-]+)\[([^\]]+)\](?:\{name=([^}]+)\})?/g;

function typeLabel(type: string): string {
  if (type === "resume_record") {
    return "招聘台";
  }
  if (type === "resume_pool") {
    return "人才库";
  }
  return type;
}

const mentionChipClassName =
  "mx-0.5 inline align-baseline font-medium text-blue-700 text-[0.95em] dark:text-blue-300";

/** Shared `@姓名` chip for composer + sent messages. */
export function RecruitingMentionChip({
  label,
  directiveId,
  directiveType,
  title,
}: {
  label: string;
  directiveId?: string;
  directiveType?: string;
  title?: string;
}) {
  return (
    <span
      className={mentionChipClassName}
      data-directive-id={directiveId}
      data-directive-type={directiveType}
      title={title}
    >
      @{label}
    </span>
  );
}

/** Lexical `directiveChip` — blue `@姓名` instead of raw `:type[label]{name=id}`. */
export function RecruitingComposerDirectiveChip({
  directiveId,
  directiveType,
  label,
}: DirectiveChipProps) {
  return (
    <RecruitingMentionChip
      directiveId={directiveId}
      directiveType={directiveType}
      label={label}
      title={typeLabel(directiveType)}
    />
  );
}

export const RecruitingDirectiveText: TextMessagePartComponent = ({ text }) => {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, type = "mention", label = "", id] = match;
    nodes.push(
      <RecruitingMentionChip
        directiveId={id}
        directiveType={type}
        key={`${match.index}-${label}`}
        label={label}
        title={id ? `${typeLabel(type)} · ${id}` : typeLabel(type)}
      />,
    );
    ({ lastIndex } = DIRECTIVE_RE);
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  if (nodes.length === 0) {
    return <>{text}</>;
  }
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
};
