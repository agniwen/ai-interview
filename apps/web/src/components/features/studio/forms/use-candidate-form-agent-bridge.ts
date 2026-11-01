import { useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CandidateFormTemplateInput } from "@app/db-schema/candidate-forms";
import {
  pickCandidateFormAgentPageContext,
  toCandidateFormQuestions,
} from "@app/shared/candidate-form-agent";
import type { CandidateFormAgentPageContext } from "@app/shared/candidate-form-agent";
import {
  subscribeToFormStore,
  useRegisterSubjectAgentForm,
} from "@/components/features/subject-agent/subject-agent-context";
import type { SubjectAgentFormBridge } from "@/components/features/subject-agent/subject-agent-context";

type AgentWritableField = "description" | "jobDescriptionIds" | "questions" | "scope" | "title";

/** 表单题编辑器中 Hireseer Agent 需要的读写能力。 */
interface CandidateFormAgentEditor {
  /** 最近一次保存的内容；新建时为 null。 */
  savedValues: CandidateFormTemplateInput | null;
  setSelectedQuestionId: Dispatch<SetStateAction<string | null>>;
  /** 由调用方保证字段与值匹配；本 hook 内只按字段写入对应类型的值。 */
  setValue: (
    field: AgentWritableField,
    value: NonNullable<CandidateFormTemplateInput[AgentWritableField]>,
  ) => void;
  /** 表单 store：读取当前内容并订阅变化。 */
  store: {
    state: { values: CandidateFormTemplateInput };
    subscribe: (listener: () => void) => { unsubscribe: () => void };
  };
}

/**
 * 在表单题编辑器中登记 Hireseer Agent 的读写接口（ADR-0045）：只写入未保存的表单；题目列表
 * 被替换后，原选中题目不存在时改选第一题。不在 Agent Provider 内（如弹窗编辑）时为空操作。
 */
export function useCandidateFormAgentBridge(editor: CandidateFormAgentEditor) {
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  });
  const bridge = useMemo<SubjectAgentFormBridge>(
    () => ({
      getPageContext: () => pickCandidateFormAgentPageContext(editorRef.current.store.state.values),
      getSavedContext: () => {
        const { savedValues } = editorRef.current;
        return savedValues ? pickCandidateFormAgentPageContext(savedValues) : null;
      },
      kind: "candidate_form_template",
      subscribe: (listener) => subscribeToFormStore(editorRef.current.store, listener),
      write: (values: Partial<CandidateFormAgentPageContext>) => {
        const { current } = editorRef;
        if (values.title !== undefined) {
          current.setValue("title", values.title);
        }
        if (values.description !== undefined) {
          current.setValue("description", values.description);
        }
        if (values.scope !== undefined) {
          current.setValue("scope", values.scope);
        }
        if (values.jobDescriptionIds !== undefined) {
          current.setValue("jobDescriptionIds", values.jobDescriptionIds);
        }
        if (values.questions !== undefined) {
          const questions = toCandidateFormQuestions(values.questions);
          current.setValue("questions", questions);
          current.setSelectedQuestionId((selected) =>
            questions.some((question) => question.id === selected)
              ? selected
              : (questions[0]?.id ?? null),
          );
        }
      },
    }),
    [],
  );
  useRegisterSubjectAgentForm(bridge);
}
