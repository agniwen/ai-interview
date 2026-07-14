import type { UIExperimentConfig } from "./experimental-ui-context";

export const UI_EXPERIMENTS: UIExperimentConfig[] = [
  {
    key: "entity-list-page",
    name: "Entity List page UI",
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
      { label: "Current state", value: "current" },
      { label: "New proposal", value: "new-proposal" },
    ],
  },
];
