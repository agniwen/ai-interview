'use client';

import { driver } from 'driver.js';
import { atom, getDefaultStore } from 'jotai';
import 'driver.js/dist/driver.css';

export const studioTutorialStepAtom = atom<number | null>(null);

const store = getDefaultStore();

/** Steps 0–4: page overview; steps 5–8: inside create dialog */
export const STUDIO_DIALOG_FIRST_STEP = 5;
export const STUDIO_DIALOG_LAST_STEP = 8;
export const STUDIO_QUESTIONS_TAB_STEP = 7;

const TOUR_STEPS = [
  {
    element: '[data-tour="studio-create-btn"]',
    popover: {
      title: '新建简历记录',
      description: '点击可创建候选人记录，支持手动录入或上传 PDF 简历自动解析并生成面试题。',
    },
  },
  {
    element: '[data-tour="studio-stats"]',
    popover: {
      title: '数据总览',
      description: '实时展示候选人总数、待面试人数、面试轮次数等关键指标。',
    },
  },
  {
    element: '[data-tour="studio-search"]',
    popover: {
      title: '搜索候选人',
      description: '输入候选人姓名、目标岗位、轮次标签或简历文件名进行快速检索。',
    },
  },
  {
    element: '[data-tour="studio-status-filter"]',
    popover: {
      title: '状态筛选',
      description: '按面试流程状态（草稿、就绪、进行中、已完成、已归档）过滤记录。',
    },
  },
  {
    element: '[data-tour="studio-table"]',
    popover: {
      title: '记录列表',
      description: '展示所有候选人记录，支持排序。点击右侧操作菜单可复制面试链接、查看详情、编辑或删除。',
    },
  },
  // --- Steps inside the Create Dialog ---
  {
    element: '[data-tour="studio-dialog-basic"]',
    popover: {
      title: '基础信息',
      description: '填写候选人姓名、邮箱、目标岗位和当前流程状态。也可以上传 PDF 简历自动回填。',
    },
  },
  {
    element: '[data-tour="studio-dialog-schedule"]',
    popover: {
      title: '面试安排',
      description: '添加面试轮次（一面、二面、HR 面等），为每轮设置时间和备注。',
    },
  },
  {
    element: '[data-tour="studio-dialog-questions"]',
    popover: {
      title: '面试题目',
      description: '上传简历后会自动生成面试题，也可以手动添加和编辑题目及难度。',
    },
  },
  {
    element: '[data-tour="studio-dialog-submit"]',
    popover: {
      title: '保存记录',
      description: '确认信息无误后点击保存，系统会自动生成候选人的唯一面试入口链接。',
    },
  },
];

function createDriverInstance() {
  return driver({
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    popoverClass: 'chat-tour-popover',
    allowClose: true,
    overlayClickBehavior: () => {},
    steps: TOUR_STEPS.map((step, index) => ({
      ...step,
      onHighlightStarted: () => {
        store.set(studioTutorialStepAtom, index);
      },
    })),
    onDestroyed: () => {
      store.set(studioTutorialStepAtom, null);
    },
  });
}

// eslint-disable-next-line react/no-unnecessary-use-prefix
export function useStudioTutorial() {
  return {
    startTutorial: () => {
      const d = createDriverInstance();
      d.drive();
    },
  };
}
