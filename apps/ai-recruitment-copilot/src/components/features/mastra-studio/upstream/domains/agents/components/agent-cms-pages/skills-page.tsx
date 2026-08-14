import type { StoredSkillResponse } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import {
  Entity,
  EntityContent,
  EntityName,
  EntityDescription,
} from "@mastra/playground-ui/components/Entity";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mastra/playground-ui/components/InputGroup";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { Plus, Drill, SearchIcon } from "lucide-react";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { omitRecordKey } from "@/components/features/mastra-studio/upstream/domains/agents/utils/record";

import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import { useStoredSkills } from "../../hooks/use-stored-skills";
import { SkillEditDialog } from "./skill-edit-dialog";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";
import { isTruthy } from "../../utils/truthiness";

export function SkillsPage() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const { data: storedSkillsResponse, isLoading } = useStoredSkills();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSkills = useWatch({ control, name: "skills" }) ?? {};
  const selectedSkillIds = Object.keys(selectedSkills);

  const storedSkills = storedSkillsResponse?.skills ?? [];

  const getSkillDescription = (skillId: string): string => {
    const skill = storedSkills.find((s) => s.id === skillId);
    return skill?.description || "";
  };

  const handleToggleSkill = (skillId: string) => {
    const currentSkills = form.getValues("skills") ?? {};
    const isSelected = currentSkills[skillId] !== undefined;
    if (isSelected) {
      const next = omitRecordKey(currentSkills, skillId);
      form.setValue("skills", next);
    } else {
      form.setValue("skills", {
        ...currentSkills,
        [skillId]: { description: getSkillDescription(skillId) },
      });
    }
  };

  const handleSkillCreated = (skill: StoredSkillResponse, workspaceId: string) => {
    const currentSkills = form.getValues("skills") ?? {};
    form.setValue("skills", {
      ...currentSkills,
      [skill.id]: { description: skill.description || "" },
    });
    form.setValue("workspace", { type: "id", workspaceId });
    setDialogOpen(false);
  };

  const filteredSkills = storedSkills.filter((skill) =>
    skill.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCount = selectedSkillIds.length;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SectionHeader
            title="技能"
            subtitle={`使用技能为智能体提供专业知识。${totalCount > 0 ? `（已选择 ${totalCount} 个）` : ""}`}
          />

          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3" />
              添加技能
            </Button>
          )}
        </div>

        <InputGroup variant="outline">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="搜索技能"
            placeholder="搜索技能"
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>

        {filteredSkills.length > 0 && (
          <div className="flex flex-col gap-2">
            {filteredSkills.map((skill) => (
              <Entity key={skill.id} className="bg-surface2">
                <EntityContent>
                  <EntityName>{skill.name}</EntityName>
                  <EntityDescription>{skill.description || "暂无描述"}</EntityDescription>
                </EntityContent>

                {!readOnly && (
                  <Switch
                    checked={selectedSkillIds.includes(skill.id)}
                    onCheckedChange={() => handleToggleSkill(skill.id)}
                  />
                )}
              </Entity>
            ))}
          </div>
        )}

        {!isLoading && storedSkills.length === 0 && (
          <div className="py-12">
            <EmptyState
              iconSlot={<Drill height={40} width={40} />}
              titleSlot="暂无可用技能"
              descriptionSlot="创建技能，为智能体提供专业知识。"
              actionSlot={
                isTruthy(!readOnly) ? (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus />
                    添加技能
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      <SkillEditDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSkillCreated={handleSkillCreated}
      />
    </ScrollArea>
  );
}
