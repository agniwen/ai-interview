import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionDimensionWeights } from "@arc/db-schema/job-description-structured-config";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DIMENSION_LABELS: Record<keyof JobDescriptionDimensionWeights, string> = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
};

export function JobEvaluationBlueprintPreview({
  blueprint,
  weights,
}: {
  blueprint: JobEvaluationBlueprint;
  weights: JobDescriptionDimensionWeights;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>评估蓝图预览</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section className="space-y-2">
          <h4 className="font-medium">原子门槛</h4>
          {blueprint.hardGateRequirements.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {blueprint.hardGateRequirements.map((requirement) => (
                <li key={requirement.requirementId}>{requirement.normalizedRequirement}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">未配置硬性门槛</p>
          )}
        </section>
        <section className="space-y-2">
          <h4 className="font-medium">技能期望</h4>
          <div className="flex flex-wrap gap-2">
            {blueprint.coreSkills.map((skill) => (
              <Badge key={`core-${skill.normalizedSkill}`}>必备 · {skill.normalizedSkill}</Badge>
            ))}
            {blueprint.auxiliarySkills.map((skill) => (
              <Badge key={`aux-${skill.normalizedSkill}`} variant="secondary">
                辅助 · {skill.normalizedSkill}
              </Badge>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <h4 className="font-medium">权重</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(weights).map(([dimension, weight]) => (
              <Badge key={dimension} variant="outline">
                {DIMENSION_LABELS[dimension as keyof JobDescriptionDimensionWeights]} {weight}%
              </Badge>
            ))}
          </div>
        </section>
        {blueprint.requiredRelevantExperience ? (
          <p>
            相关经验：{blueprint.requiredRelevantExperience.years} 年 ·{" "}
            {blueprint.requiredRelevantExperience.scopeDescription}
          </p>
        ) : null}
        {blueprint.educationExpectation ? (
          <p>学历要求：{blueprint.educationExpectation.sourceText}</p>
        ) : null}
        <p>
          优先条件 {blueprint.priorityConditions.length} 项；排除条件{" "}
          {blueprint.exclusionConditions.length} 项
        </p>
      </CardContent>
    </Card>
  );
}
