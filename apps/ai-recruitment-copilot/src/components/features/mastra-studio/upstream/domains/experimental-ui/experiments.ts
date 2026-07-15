import type { UIExperimentConfig } from "./experimental-ui-context";

export const UI_EXPERIMENTS: UIExperimentConfig[] = [
  {
    key: "entity-list-page",
    name: "实体列表页界面",
    path: [
      "/agents",
      "/prompts",
      "/tools",
      "/datasets",
      "/scorers",
      "/mcps",
      "/workflows",
      "/processors",
    ],
    variants: [
      { label: "当前版本", value: "current" },
      { label: "新版方案", value: "new-proposal" },
    ],
  },
];
