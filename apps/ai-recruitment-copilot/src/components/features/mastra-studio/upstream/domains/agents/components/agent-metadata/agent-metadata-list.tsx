import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";

export interface AgentMetadataListProps {
  children: React.ReactNode;
}

export const AgentMetadataList = ({ children }: AgentMetadataListProps) => (
  <ul className="flex flex-wrap gap-2">{children}</ul>
);

export interface AgentMetadataListItemProps {
  children: React.ReactNode;
  className?: string;
}

export const AgentMetadataListItem = ({ children, className }: AgentMetadataListItemProps) => (
  <li className={cn("shrink-0 font-medium flex", className)}>{children}</li>
);

export interface AgentMetadataListEmptyProps {
  children: React.ReactNode;
}

export const AgentMetadataListEmpty = ({ children }: AgentMetadataListEmptyProps) => (
  <Txt variant="ui-sm" className="text-neutral6">
    {children}
  </Txt>
);
