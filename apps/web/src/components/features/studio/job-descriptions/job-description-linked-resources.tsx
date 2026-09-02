"use client";

import { IconClipboardList, IconExternalLink, IconListCheck } from "@tabler/icons-react";
import type { CandidateFormTemplateListRecord } from "@app/db-schema/candidate-forms";
import type { InterviewQuestionTemplateListRecord } from "@app/db-schema/interview-question-templates";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LinkedFormsList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: CandidateFormTemplateListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/forms?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的表单题</p>
          <p className="mt-1 text-muted-foreground text-xs">
            候选人进入面试前需要填写下列表单题；全局表单题在「表单题」菜单中维护。
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <a href={newTemplateHref} target="_blank" rel="noreferrer">
              <IconExternalLink className="size-3.5" />
              管理表单
            </a>
          }
          size="sm"
          variant="outline"
        />
      </div>

      {isLoading ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联表单…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的表单题。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <a
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/forms?templateId=${template.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <IconClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{template.title}</p>
                      {template.description ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground text-xs">
                        {template.questionCount} 题 · {template.submissionCount} 份答复
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">岗位专属</Badge>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LinkedInterviewQuestionTemplatesList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: InterviewQuestionTemplateListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/interview-questions?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的沟通题</p>
          <p className="mt-1 text-muted-foreground text-xs">
            创建AI面试时会自动绑定到下列沟通题的最新版本；全局沟通题在「沟通题」菜单中维护。
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <a href={newTemplateHref} target="_blank" rel="noreferrer">
              <IconExternalLink className="size-3.5" />
              管理模版
            </a>
          }
          size="sm"
          variant="outline"
        />
      </div>

      {isLoading ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联模版…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的沟通题。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <a
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/interview-questions?templateId=${template.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <IconListCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{template.title}</p>
                      {template.description ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground text-xs">
                        {template.questionCount} 题 · {template.bindingCount} 个面试已绑定
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">岗位专属</Badge>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
