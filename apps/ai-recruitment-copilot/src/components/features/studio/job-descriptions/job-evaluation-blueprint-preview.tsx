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

const DIMENSION_ORDER: (keyof JobDescriptionDimensionWeights)[] = [
  "skillMatch",
  "experienceRelevance",
  "projectMatch",
  "educationBackground",
  "potential",
  "stability",
];

export function JobEvaluationBlueprintPreview({
  blueprint,
  weights,
}: {
  blueprint: JobEvaluationBlueprint;
  weights: JobDescriptionDimensionWeights;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">评估蓝图预览</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 text-sm">
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
          <h4 className="font-medium">六维评分标准</h4>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {DIMENSION_ORDER.map((dimension) => {
              const expectations = blueprint.dimensionExpectations[dimension];
              return (
                <div className="space-y-1.5 rounded-md border p-2.5" key={dimension}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{DIMENSION_LABELS[dimension]}</span>
                    <Badge variant="outline">{weights[dimension]}%</Badge>
                  </div>
                  {expectations.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                      {expectations.map((expectation) => (
                        <li key={`${dimension}-${expectation.expectation}`}>
                          {expectation.expectation}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">未识别到明确标准</p>
                  )}
                </div>
              );
            })}
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
