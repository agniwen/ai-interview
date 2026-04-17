'use client';

import { driver } from 'driver.js';
import { getDefaultStore } from 'jotai';
import { tutorialStepAtom } from '../_atoms/tutorial';
import 'driver.js/dist/driver.css';

const store = getDefaultStore();

const TOUR_STEPS = [
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: '聊天记录',
      description: '在这里查看和管理你的所有历史对话，点击可切换会话。',
    },
  },
  {
    element: '[data-tour="suggestions"]',
    popover: {
      title: '快速提问',
      description: '点击预设问题可快速追加到输入框，适合常见的简历分析场景。',
    },
  },
  {
    element: '[data-tour="prompt-input"]',
    popover: {
      title: '输入区域',
      description: '在这里输入你的筛选需求，也可以直接拖拽 PDF 简历到此区域上传（最多 8 份，每份不超过 10MB）。',
    },
  },
  {
    element: '[data-tour="file-upload"]',
    popover: {
      title: '上传简历',
      description: '点击这里可以上传 PDF 简历文件，也可以清空已上传的附件。',
    },
  },
  {
    element: '[data-tour="jd-settings"]',
    popover: {
      title: '岗位描述（JD）',
      description: '配置目标岗位的职位描述，AI 会结合 JD 进行更精准的简历评估。',
    },
  },
  {
    element: '[data-tour="thinking-toggle"]',
    popover: {
      title: '深度思考',
      description: '开启后 AI 会展示完整的推理过程，帮助你理解分析逻辑。',
    },
  },
  {
    element: '[data-tour="send-button"]',
    popover: {
      title: '发送',
      description: '输入内容或上传简历后，点击发送开始分析。分析过程中可随时点击停止。',
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
    overlayClickBehavior: () => { /* no-op: prevent overlay click from closing */ },
    steps: TOUR_STEPS.map((step, index) => ({
      ...step,
      onHighlightStarted: () => {
        store.set(tutorialStepAtom, index);
      },
    })),
    onDestroyed: () => {
      store.set(tutorialStepAtom, null);
    },
  });
}

// eslint-disable-next-line react/no-unnecessary-use-prefix
export function useChatTutorial() {
  return {
    startTutorial: () => {
      const d = createDriverInstance();
      d.drive();
    },
  };
}
