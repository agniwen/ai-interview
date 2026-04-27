"use client";

import { driver } from "driver.js";
import { getDefaultStore } from "jotai";
import { tutorialStepAtom } from "../_atoms/tutorial";
import "driver.js/dist/driver.css";

const store = getDefaultStore();

const TOUR_STEPS = [
  {
    element: '[data-tour="sidebar"]',
    popover: {
      description: "在这里查看和管理你的所有历史对话，点击可切换会话。",
      title: "聊天记录",
    },
  },
  {
    element: '[data-tour="suggestions"]',
    popover: {
      description: "点击预设问题可快速追加到输入框，适合常见的简历分析场景。",
      title: "快速提问",
    },
  },
  {
    element: '[data-tour="prompt-input"]',
    popover: {
      description:
        "在这里输入你的筛选需求，也可以直接拖拽 PDF 简历到此区域上传（最多 8 份，每份不超过 10MB）。",
      title: "输入区域",
    },
  },
  {
    element: '[data-tour="file-upload"]',
    popover: {
      description: "点击这里可以上传 PDF 简历文件，也可以清空已上传的附件。",
      title: "上传简历",
    },
  },
  {
    element: '[data-tour="jd-settings"]',
    popover: {
      description:
        "在这里配置目标岗位的职位描述，AI 会结合 JD 进行更精准的简历评估；其他偏好（如深度思考）也会归集到这个菜单里。",
      title: "岗位与偏好设置",
    },
  },
  {
    element: '[data-tour="thinking-toggle"]',
    popover: {
      description:
        "在「岗位设置」菜单底部的偏好开关。开启后 AI 会展示完整的推理过程，帮助你理解分析逻辑；默认关闭。",
      title: "深度思考",
    },
  },
  {
    element: '[data-tour="send-button"]',
    popover: {
      description: "输入内容或上传简历后，点击发送开始分析。分析过程中可随时点击停止。",
      title: "发送",
    },
  },
];

function createDriverInstance() {
  return driver({
    allowClose: true,
    doneBtnText: "完成",
    nextBtnText: "下一步",
    onDestroyed: () => {
      store.set(tutorialStepAtom, null);
    },
    overlayClickBehavior: () => {
      /* no-op: prevent overlay click from closing */
    },
    popoverClass: "chat-tour-popover",
    prevBtnText: "上一步",
    progressText: "{{current}} / {{total}}",
    showProgress: true,
    steps: TOUR_STEPS.map((step, index) => ({
      ...step,
      onHighlightStarted: () => {
        store.set(tutorialStepAtom, index);
      },
    })),
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
