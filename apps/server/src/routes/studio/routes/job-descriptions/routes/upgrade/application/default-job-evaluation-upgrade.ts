import { compileDefaultJobEvaluationDraft } from "../../../application/default-job-evaluation-lifecycle";
import {
  createUpgradeDraft,
  discardUpgradeDraft,
  getUpgradeDraft,
  publishUpgradeDraft,
  saveUpgradeManualPreview,
  saveUpgradePreview,
  updateUpgradeDraft,
} from "../dao";
import { createJobEvaluationUpgradeApplication } from "./job-evaluation-upgrade";

export const jobEvaluationUpgradeApplication = createJobEvaluationUpgradeApplication({
  compile: compileDefaultJobEvaluationDraft,
  createDraft: createUpgradeDraft,
  discardDraft: discardUpgradeDraft,
  getDraft: getUpgradeDraft,
  publishDraft: publishUpgradeDraft,
  saveManualPreview: saveUpgradeManualPreview,
  savePreview: saveUpgradePreview,
  updateDraft: updateUpgradeDraft,
});
