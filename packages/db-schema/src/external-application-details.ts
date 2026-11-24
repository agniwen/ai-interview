export const externalApplicationWorkModeValues = ["onsite", "remote"] as const;

export type ExternalApplicationWorkMode = (typeof externalApplicationWorkModeValues)[number];

export const externalApplicationWorkModeLabels = {
  onsite: "线下集中办公/office",
  remote: "远程/remote",
} as const satisfies Record<ExternalApplicationWorkMode, string>;

export interface ExternalApplicationDetails {
  alternateJobDescriptionId?: string | null;
  alternateJobName?: string | null;
  batch?: string | null;
  className?: string | null;
  contactRaw?: string | null;
  portfolioContribution?: string | null;
  trainingInstitution: string;
  workMode: ExternalApplicationWorkMode;
}
