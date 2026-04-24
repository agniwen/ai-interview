"use client";

import type { DriveStep } from "driver.js";
import { driver } from "driver.js";
import { atom, getDefaultStore } from "jotai";
import "driver.js/dist/driver.css";

export type StudioTourKey =
  | "interviews"
  | "departments"
  | "interviewers"
  | "job-descriptions"
  | "forms";

export const studioTutorialStepAtom = atom<number | null>(null);

const store = getDefaultStore();

/** Interviews tour — steps 0–4: page overview; steps 5–8: inside create dialog. */
export const STUDIO_DIALOG_FIRST_STEP = 5;
export const STUDIO_DIALOG_LAST_STEP = 8;
export const STUDIO_QUESTIONS_TAB_STEP = 7;

const INTERVIEWS_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="studio-create-btn"]',
    popover: {
      description: "点击可创建候选人记录，支持手动录入或上传 PDF 简历自动解析并生成面试题。",
      title: "新建简历记录",
    },
  },
  {
    element: '[data-tour="studio-stats"]',
    popover: {
      description: "实时展示候选人总数、待面试人数、面试轮次数等关键指标。",
      title: "数据总览",
    },
  },
  {
    element: '[data-tour="studio-search"]',
    popover: {
      description: "输入候选人姓名、目标岗位、轮次标签或简历文件名进行快速检索。",
      title: "搜索候选人",
    },
  },
  {
    element: '[data-tour="studio-status-filter"]',
    popover: {
      description: "按面试流程状态（草稿、就绪、进行中、已完成、已归档）过滤记录。",
      title: "状态筛选",
    },
  },
  {
    element: '[data-tour="studio-table"]',
    popover: {
      description:
        "展示所有候选人记录，支持排序。点击右侧操作菜单可复制面试链接、查看详情、编辑或删除。",
      title: "记录列表",
    },
  },
  // --- Steps inside the Create Dialog ---
  {
    element: '[data-tour="studio-dialog-basic"]',
    popover: {
      description: "填写候选人姓名、邮箱、目标岗位和当前流程状态。也可以上传 PDF 简历自动回填。",
      title: "基础信息",
    },
  },
  {
    element: '[data-tour="studio-dialog-schedule"]',
    popover: {
      description: "添加面试轮次（一面、二面、HR 面等），为每轮设置时间和备注。",
      title: "面试安排",
    },
  },
  {
    element: '[data-tour="studio-dialog-questions"]',
    popover: {
      description: "上传简历后会自动生成面试题，也可以手动添加和编辑题目及难度。",
      title: "面试题目",
    },
  },
  {
    element: '[data-tour="studio-dialog-submit"]',
    popover: {
      description: "确认信息无误后点击保存，系统会自动生成候选人的唯一面试入口链接。",
      title: "保存记录",
    },
  },
];

const DEPARTMENTS_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="studio-departments-search"]',
    popover: {
      description: "输入部门名称或描述关键字进行筛选，支持模糊匹配。",
      title: "搜索部门",
    },
  },
  {
    element: '[data-tour="studio-departments-create"]',
    popover: {
      description: "点击创建一个新的业务部门，作为面试官和在招岗位的组织维度。",
      title: "新建部门",
    },
  },
  {
    element: '[data-tour="studio-departments-table"]',
    popover: {
      description:
        "展示所有部门及其描述、引用情况（被多少面试官和在招岗位关联）以及创建时间。仍被引用的部门无法直接删除。",
      title: "部门列表",
    },
  },
];

const INTERVIEWERS_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="studio-interviewers-search"]',
    popover: {
      description: "根据面试官名称或描述进行快速检索。",
      title: "搜索面试官",
    },
  },
  {
    element: '[data-tour="studio-interviewers-department-filter"]',
    popover: {
      description: "按所属部门过滤，快速定位某个团队的面试官。",
      title: "按部门筛选",
    },
  },
  {
    element: '[data-tour="studio-interviewers-create"]',
    popover: {
      description: "创建一个 AI 面试官，配置 prompt 风格与 TTS 音色，供在招岗位引用。",
      title: "新建面试官",
    },
  },
  {
    element: '[data-tour="studio-interviewers-table"]',
    popover: {
      description: "展示面试官的所属部门、音色和被引用的岗位数量。被岗位引用中的面试官无法删除。",
      title: "面试官列表",
    },
  },
];

const JOB_DESCRIPTIONS_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="studio-jobs-search"]',
    popover: {
      description: "根据岗位名称或描述进行搜索。",
      title: "搜索岗位",
    },
  },
  {
    element: '[data-tour="studio-jobs-department-filter"]',
    popover: {
      description: "按部门筛选该部门下的所有在招岗位。",
      title: "按部门筛选",
    },
  },
  {
    element: '[data-tour="studio-jobs-interviewer-filter"]',
    popover: {
      description: "按面试官筛选，查看某位面试官关联的岗位。",
      title: "按面试官筛选",
    },
  },
  {
    element: '[data-tour="studio-jobs-create"]',
    popover: {
      description:
        "创建一个在招岗位，填写岗位描述 prompt 并指定负责该岗位的面试官。岗位需要先有部门和面试官。",
      title: "新建在招岗位",
    },
  },
  {
    element: '[data-tour="studio-jobs-table"]',
    popover: {
      description:
        "展示岗位的所属部门、关联的面试官列表和描述。岗位可以被面试记录引用，作为候选人的目标岗位。",
      title: "岗位列表",
    },
  },
];

const FORMS_TOUR_STEPS: DriveStep[] = [
  {
    popover: {
      description:
        "候选人点开面试链接后、进入语音面试间之前，会被强制要求填写这里维护的问卷。常用于背调、到岗时间确认、知情同意等需要前置收集的信息。提交后内容会冻结为快照，之后改模版不影响历史答卷。",
      title: "面试前问卷模版",
    },
  },
  {
    element: '[data-tour="studio-forms-search"]',
    popover: {
      description: "按问卷标题或说明做模糊搜索。",
      title: "搜索模版",
    },
  },
  {
    element: '[data-tour="studio-forms-scope-filter"]',
    popover: {
      description:
        "按作用范围筛选：全局问卷会出现在所有面试中；岗位绑定问卷只对该在招岗位的面试生效。",
      title: "按作用域筛选",
    },
  },
  {
    element: '[data-tour="studio-forms-jd-filter"]',
    popover: {
      description:
        "按在招岗位筛选，查看绑定到该岗位的所有问卷。从「在招岗位 → 面试前问卷」tab 点过来时也会自动用这个参数过滤。",
      title: "按岗位筛选",
    },
  },
  {
    element: '[data-tour="studio-forms-create"]',
    popover: {
      description:
        "新建一份模版：设标题、作用范围（全局或绑定岗位），添加题目。每题可选「单选 / 多选 / 填写」，再选展示方式（下拉、单/多选框、单/多行输入），并标注是否必填。",
      title: "新建模版",
    },
  },
  {
    element: '[data-tour="studio-forms-table"]',
    popover: {
      description:
        "展示作用范围、题目数和已填写人数。点「已填写」数字或「更多 → 查看填写记录」可以看到该模版下所有候选人的提交快照。",
      title: "模版列表",
    },
  },
  {
    popover: {
      description:
        "想重置某位候选人的某份问卷？去「面试库 → 候选人详情 → 问卷答复」tab，点对应卡片的「重置填写」即可，候选人下次进面试链接会被要求重新填写这一份。如果轮次已结束，还需在「面试安排」里重置轮次。",
      title: "重置候选人答卷",
    },
  },
];

const TOUR_STEPS_BY_KEY: Record<StudioTourKey, DriveStep[]> = {
  departments: DEPARTMENTS_TOUR_STEPS,
  forms: FORMS_TOUR_STEPS,
  interviewers: INTERVIEWERS_TOUR_STEPS,
  interviews: INTERVIEWS_TOUR_STEPS,
  "job-descriptions": JOB_DESCRIPTIONS_TOUR_STEPS,
};

let currentDriverInstance: ReturnType<typeof driver> | null = null;

export function refreshStudioTutorialHighlight() {
  currentDriverInstance?.refresh();
}

function createDriverInstance(tourKey: StudioTourKey) {
  const steps = TOUR_STEPS_BY_KEY[tourKey];
  const instance = driver({
    allowClose: true,
    doneBtnText: "完成",
    nextBtnText: "下一步",
    onDestroyed: () => {
      store.set(studioTutorialStepAtom, null);
      currentDriverInstance = null;
    },
    overlayClickBehavior: () => {
      // block overlay click from advancing the tour
    },
    popoverClass: "chat-tour-popover",
    prevBtnText: "上一步",
    progressText: "{{current}} / {{total}}",
    showProgress: true,
    steps: steps.map((step, index) => ({
      ...step,
      onHighlightStarted: () => {
        store.set(studioTutorialStepAtom, index);
      },
    })),
  });

  currentDriverInstance = instance;
  return instance;
}

// eslint-disable-next-line react/no-unnecessary-use-prefix
export function useStudioTutorial() {
  return {
    startTutorial: (tourKey: StudioTourKey) => {
      const d = createDriverInstance(tourKey);
      d.drive();
    },
  };
}
