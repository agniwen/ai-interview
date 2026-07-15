import { Notice } from "@mastra/playground-ui/components/Notice";
import type {
  ErrorRendererProps,
  MessageStatusRenderers,
  TripwireRendererProps,
  WarningRendererProps,
} from "@mastra/react";

import { TripwireNotice } from "../tripwire-notice";

export const ErrorStatusRenderer = ({ text }: ErrorRendererProps) => (
  <Notice variant="destructive" title="错误">
    <Notice.Message>{text}</Notice.Message>
  </Notice>
);

export const WarningStatusRenderer = ({ text }: WarningRendererProps) => (
  <Notice variant="warning" title="警告">
    <Notice.Message>{text}</Notice.Message>
  </Notice>
);

export const TripwireStatusRenderer = ({ text, tripwire }: TripwireRendererProps) => (
  <TripwireNotice reason={text} tripwire={tripwire} />
);

export const messageStatusRenderers: MessageStatusRenderers = {
  Error: ErrorStatusRenderer,
  Tripwire: TripwireStatusRenderer,
  Warning: WarningStatusRenderer,
};
