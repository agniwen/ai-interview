"use client";
/**
 * PROTOTYPE — render assistant-ui mention directives as chips in user messages
 * and in the Lexical composer (`directiveChip`).
 */

import type { TextMessagePartComponent } from "@assistant-ui/react";
import type { DirectiveChipProps } from "@assistant-ui/react-lexical";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { useRecruitingCopilotContextOptional } from "./recruiting-copilot-context";

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

function RecruitingMentionChip({
  label,
  directiveId,
  directiveType,
  onClick,
  title,
}: {
  label: string;
  directiveId?: string;
  directiveType?: string;
  onClick?: () => void;
  title?: string;
}) {
  if (onClick) {
    return (
      <button
        className={`${mentionChipClassName} cursor-pointer rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50`}
        data-directive-id={directiveId}
        data-directive-type={directiveType}
        onClick={onClick}
        title={title}
        type="button"
      >
        @{label}
      </button>
    );
  }
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
  const copilotContext = useRecruitingCopilotContextOptional();
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, type = "mention", label = "", id] = match;
    const candidateKind = type === "resume_record" || type === "resume_pool" ? type : undefined;
    nodes.push(
      <RecruitingMentionChip
        directiveId={id}
        directiveType={type}
        key={`${match.index}-${label}`}
        label={label}
        onClick={
          candidateKind && id && copilotContext
            ? () => copilotContext.openCandidateDetail({ id, kind: candidateKind })
            : undefined
        }
        title={candidateKind ? `查看${label}详情 · ${typeLabel(type)}` : typeLabel(type)}
      />,
    );
    lastIndex = match.index + match[0].length;
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
