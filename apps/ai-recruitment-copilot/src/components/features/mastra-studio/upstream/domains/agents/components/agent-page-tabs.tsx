import { Tab, TabList, Tabs } from "@mastra/playground-ui/components/Tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import {
  ExternalLink,
  EyeIcon,
  FlaskConical,
  MessageSquare,
  ClipboardCheck,
  GitBranch,
} from "lucide-react";

import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { isTruthy } from "../utils/truthiness";

/** Tabs that render a pill in the bar. Routes without a pill (e.g. settings) pass `'none'`. */
export type AgentPageTab = "chat" | "versions" | "evaluate" | "review" | "traces";

interface AgentPageTabsProps {
  agentId: string;
  /** `'none'` (or any non-tab value) leaves the bar unhighlighted. */
  activeTab: AgentPageTab | "none";
  showPlayground?: boolean;
  showObservability?: boolean;
  reviewBadge?: number;
  rightSlot?: React.ReactNode;
}

function DocsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline text-inherit hover:text-white"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function AgentTab({
  value,
  icon,
  label,
  badge,
  disabled,
  disabledReason,
}: {
  value: AgentPageTab;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  disabled?: boolean;
  disabledReason?: React.ReactNode;
}) {
  const tabContent = (
    <>
      <Icon size="sm">{icon}</Icon>
      <Txt variant="ui-sm" className="text-inherit">
        {label}
      </Txt>
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 bg-accent1 text-white text-xs font-medium rounded-full px-1.5 py-0 min-w-[18px] text-center leading-[18px]">
          {badge}
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            className="inline-flex px-3 py-2.5 text-neutral3"
          >
            {tabContent}
          </button>
        </TooltipTrigger>
        {disabledReason && <TooltipContent side="bottom">{disabledReason}</TooltipContent>}
      </Tooltip>
    );
  }

  return (
    <Tab value={value} className="px-3 py-2.5">
      {tabContent}
    </Tab>
  );
}

export function AgentPageTabs({
  agentId,
  activeTab,
  showPlayground = false,
  showObservability = false,
  reviewBadge,
  rightSlot,
}: AgentPageTabsProps) {
  const { navigate } = useLinkComponent();

  const playgroundDisabledReason = isTruthy(!showPlayground) ? (
    <p>
      配置 <code>@mastra/editor</code> 后即可使用编辑器。{" "}
      <DocsLink href="https://mastra.ai/docs/editor/overview">了解更多</DocsLink>
    </p>
  ) : undefined;
  const observabilityDisabledReason = isTruthy(!showObservability) ? (
    <p>
      添加 <code>@mastra/observability</code> 以启用此标签页。{" "}
      <DocsLink href="https://mastra.ai/docs/observability/overview">了解更多</DocsLink>
    </p>
  ) : undefined;

  const hrefMap: Record<AgentPageTab, string> = {
    chat: `/agents/${agentId}/chat/new`,
    evaluate: `/agents/${agentId}/evaluate`,
    review: `/agents/${agentId}/review`,
    traces: `/agents/${agentId}/traces`,
    versions: `/agents/${agentId}/editor`,
  };

  const handleTabChange = (value: AgentPageTab | "none") => {
    if (value === "none") {
      return;
    }
    navigate(hrefMap[value]);
  };

  return (
    // Below lg the rightSlot buttons wrap onto their own line (right-aligned)
    // when the full tab list no longer fits, so the tabs keep the full row width.
    <div className="flex min-w-0 items-center gap-2 p-1.5 max-lg:flex-wrap">
      <Tabs
        value={activeTab}
        defaultTab={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 min-w-0 max-lg:flex-auto"
      >
        <TabList variant="pill-ghost">
          <AgentTab value="chat" icon={<MessageSquare />} label="对话" />
          <AgentTab
            value="versions"
            icon={<GitBranch />}
            label="编辑器"
            disabled={!showPlayground}
            disabledReason={playgroundDisabledReason}
          />
          <AgentTab
            value="evaluate"
            icon={<FlaskConical />}
            label="评估"
            disabled={!showObservability}
            disabledReason={observabilityDisabledReason}
          />
          <AgentTab
            value="review"
            icon={<ClipboardCheck />}
            label="评审"
            badge={reviewBadge}
            disabled={!showObservability}
            disabledReason={observabilityDisabledReason}
          />
          <AgentTab
            value="traces"
            icon={<EyeIcon />}
            label="追踪"
            disabled={!showObservability}
            disabledReason={observabilityDisabledReason}
          />
        </TabList>
      </Tabs>
      {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
