import { Button } from "@mastra/playground-ui/components/Button";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { toast } from "@mastra/playground-ui/utils/toast";
import { ArrowUpIcon, BookOpen, FileText, GraduationCap, Wrench } from "lucide-react";
import { nanoid } from "nanoid";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@/components/features/mastra-studio/router/compat";
import { useBuilderSettings } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-settings";
import { useCreateSkill } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-create-skill";
import { useDefaultVisibility } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-default-visibility";
import { useStoredWorkspaces } from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-stored-workspaces";

const EXAMPLES = [
  {
    icon: Wrench,
    prompt:
      "构建一个审查 TypeScript 代码的技能：查找类型安全问题、缺失测试和不一致的代码模式，并给出带示例的具体建议。",
    title: "代码审查",
  },
  {
    icon: FileText,
    prompt: "构建一个将长篇技术文档总结为单页简报的技能，包含关键要点、行动项和待解决问题。",
    title: "文档摘要",
  },
  {
    icon: GraduationCap,
    prompt:
      "构建一个帮助新工程师熟悉代码库的技能：讲解架构、指向正确文档，并用清晰语言和代码示例回答问题。",
    title: "入职辅导",
  },
  {
    icon: BookOpen,
    prompt: "构建一个将零散研究笔记整理为结构化结论的技能，包含来源、方法和顶部摘要。",
    title: "研究笔记",
  },
];

const truncateName = (prompt: string): string =>
  prompt.length <= 20 ? prompt : `${prompt.slice(0, 20)}…`;

export const SkillBuilderStarter = () => {
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createSkill = useCreateSkill();
  const defaultVisibility = useDefaultVisibility();
  const { data: workspacesData } = useStoredWorkspaces();
  const { data: builderSettings } = useBuilderSettings();

  const workspaceOptions = useMemo(
    () =>
      (workspacesData?.workspaces ?? [])
        .filter((ws) => ws.status !== "archived")
        .toSorted((a, b) => (b.runtimeRegistered ? 1 : 0) - (a.runtimeRegistered ? 1 : 0))
        .map((ws) => ({ label: ws.name, value: ws.id })),
    [workspacesData],
  );

  const builderDefaultWorkspaceId = useMemo(() => {
    const ws = (builderSettings?.configuration?.agent as Record<string, unknown> | undefined)
      ?.workspace as { type: string; workspaceId?: string } | undefined;
    return ws?.type === "id" ? ws.workspaceId : undefined;
  }, [builderSettings]);

  const trimmed = message.trim();
  const isCreating = createSkill.isPending;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (trimmed.length === 0 || isCreating) {
      return;
    }
    const id = nanoid();
    const workspaceId =
      builderDefaultWorkspaceId ??
      (workspaceOptions.length === 1 ? workspaceOptions[0].value : undefined);
    try {
      await createSkill.mutateAsync({
        description: "",
        files: [],
        id,
        instructions: "",
        name: truncateName(trimmed),
        visibility: defaultVisibility,
        workspaceId,
      });
    } catch {
      toast.error("新建技能失败");
      return;
    }
    void navigate(`/agent-builder/skills/${id}/edit`, {
      state: { userMessage: trimmed },
      viewTransition: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCreating) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const handleExampleClick = (prompt: string) => {
    setMessage(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="starter-aurora flex min-h-full flex-col items-center justify-center bg-surface1 px-6 py-24">
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-12">
        <h1
          className="starter-heading text-center font-serif text-neutral6"
          style={{
            fontSize: "clamp(1.875rem, 3.5vw, 2.5rem)",
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          你想构建什么技能？
        </h1>

        <form onSubmit={handleSubmit}>
          <div
            className="starter-prompt rounded-2xl border border-border1 bg-surface2 transition-colors duration-normal ease-out-custom focus-within:border-neutral3"
            style={{ viewTransitionName: "skill-chat-composer" }}
          >
            <Textarea
              ref={textareaRef}
              testId="skill-builder-starter-input"
              size="default"
              variant="unstyled"
              placeholder="描述你想构建的技能…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isCreating}
              className="min-h-[112px] resize-none px-5 py-4 text-ui-md outline-none placeholder:text-neutral3 focus:outline-none focus-visible:outline-none"
              rows={3}
            />
            <div className="flex items-center justify-end px-3 pb-2.5">
              <Button
                type="submit"
                variant="default"
                size="icon-md"
                tooltip="开始构建"
                disabled={trimmed.length === 0 || isCreating}
                data-testid="skill-builder-starter-submit"
                className="rounded-full"
              >
                {isCreating ? (
                  <span data-testid="skill-builder-starter-submit-spinner">
                    <Spinner />
                  </span>
                ) : (
                  <ArrowUpIcon />
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((example, i) => {
            const Icon = example.icon;
            return (
              <button
                key={example.title}
                type="button"
                onClick={() => handleExampleClick(example.prompt)}
                data-testid={`skill-builder-starter-example-${example.title.toLowerCase().replaceAll(/\s+/g, "-")}`}
                style={{ animationDelay: `${280 + i * 40}ms` }}
                className="starter-chip group inline-flex items-center gap-2 rounded-full border border-border1 bg-transparent px-4 py-2 text-ui-sm text-neutral4 transition-colors duration-normal ease-out-custom hover:border-border2 hover:bg-surface2 hover:text-neutral6"
              >
                <Icon className="h-3.5 w-3.5 text-neutral3 transition-colors group-hover:text-neutral5" />
                {example.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
