import {
  EntityName,
  EntityDescription,
  EntityContent,
  Entity,
} from "@mastra/playground-ui/components/Entity";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mastra/playground-ui/components/InputGroup";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Section, SubSectionRoot } from "@mastra/playground-ui/components/Section";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { RuleGroup } from "@mastra/playground-ui/utils/rule-engine";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { omitRecordKey } from "@/components/features/mastra-studio/upstream/domains/agents/utils/record";

import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import { useAgents } from "../../hooks/use-agents";
import { DisplayConditionsDialog } from "@/components/features/mastra-studio/upstream/domains/cms/components/display-conditions/display-conditions-dialog";
import {
  SectionHeader,
  SubSectionHeader,
} from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";

export function AgentsPage() {
  const { form, readOnly, agentId: currentAgentId } = useAgentEditFormContext();
  const { control } = form;
  const { data: agents } = useAgents();
  const selectedAgents = useWatch({ control, name: "agents" });
  const variables = useWatch({ control, name: "variables" });
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    if (!agents) {
      return [];
    }
    const agentList = Array.isArray(agents)
      ? agents
      : Object.entries(agents).map(([id, agent]) => ({
          description: (agent as { description?: string }).description || "",
          id,
          name: (agent as { name?: string }).name || id,
        }));
    return agentList
      .filter((agent) => agent.id !== currentAgentId)
      .map((agent) => ({
        description: (agent as { description?: string }).description || "",
        label: agent.name || agent.id,
        value: agent.id,
      }));
  }, [agents, currentAgentId]);

  const selectedAgentIds = Object.keys(selectedAgents || {});
  const count = selectedAgentIds.length;

  const getOriginalDescription = (id: string): string => {
    const option = options.find((opt) => opt.value === id);
    return option?.description || "";
  };

  const handleValueChange = (agentId: string) => {
    const isSet = selectedAgents?.[agentId] !== undefined;
    if (isSet) {
      const next = omitRecordKey(selectedAgents, agentId);
      form.setValue("agents", next, { shouldDirty: true });
    } else {
      form.setValue(
        "agents",
        {
          ...selectedAgents,
          [agentId]: { ...selectedAgents?.[agentId], description: getOriginalDescription(agentId) },
        },
        { shouldDirty: true },
      );
    }
  };

  const handleDescriptionChange = (agentId: string, description: string) => {
    form.setValue(
      "agents",
      {
        ...selectedAgents,
        [agentId]: { ...selectedAgents?.[agentId], description },
      },
      { shouldDirty: true },
    );
  };

  const handleRulesChange = (agentId: string, rules: RuleGroup | undefined) => {
    form.setValue(
      "agents",
      {
        ...selectedAgents,
        [agentId]: { ...selectedAgents?.[agentId], rules },
      },
      { shouldDirty: true },
    );
  };

  const filteredOptions = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SectionHeader
            title="子智能体"
            subtitle={`选择此智能体可委派任务的子智能体。${count > 0 ? `（已选择 ${count} 个）` : ""}`}
          />
        </div>

        <SubSectionRoot>
          <Section.Header>
            <SubSectionHeader title="可用智能体" icon={<AgentIcon />} />
          </Section.Header>

          <InputGroup variant="outline">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="搜索智能体"
              placeholder="搜索智能体"
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>

          {filteredOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              {filteredOptions.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.value);

                const isDisabled = readOnly || !isSelected;

                return (
                  <Entity key={agent.value} className="bg-surface2">
                    <EntityContent>
                      <EntityName>{agent.label}</EntityName>
                      <EntityDescription>
                        <input
                          aria-label={`${agent.label} 的描述`}
                          type="text"
                          disabled={isDisabled}
                          className={cn(
                            "border border-transparent appearance-none block w-full text-neutral3 bg-transparent",
                            !isDisabled && "border-border1 border-dashed ",
                          )}
                          value={
                            isSelected
                              ? (selectedAgents?.[agent.value]?.description ?? agent.description)
                              : agent.description
                          }
                          onChange={(e) => handleDescriptionChange(agent.value, e.target.value)}
                        />
                      </EntityDescription>
                    </EntityContent>

                    {isSelected && !readOnly && (
                      <DisplayConditionsDialog
                        entityName={agent.label}
                        schema={variables}
                        rules={selectedAgents?.[agent.value]?.rules}
                        onRulesChange={(rules) => handleRulesChange(agent.value, rules)}
                      />
                    )}

                    {!readOnly && (
                      <Switch
                        checked={selectedAgentIds.includes(agent.value)}
                        onCheckedChange={() => handleValueChange(agent.value)}
                      />
                    )}
                  </Entity>
                );
              })}
            </div>
          )}
        </SubSectionRoot>
      </div>
    </ScrollArea>
  );
}
