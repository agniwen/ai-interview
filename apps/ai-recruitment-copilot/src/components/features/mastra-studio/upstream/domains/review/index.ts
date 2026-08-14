import { DatasetReview as DatasetReviewComponent } from "./components/dataset-review";
import { ProposalTag as ProposalTagComponent } from "./components/proposal-tag";
import { ReviewItemCard as ReviewItemCardComponent } from "./components/review-item-card";
import { ReviewPipelineCard as ReviewPipelineCardComponent } from "./components/review-pipeline-card";
import { TagPicker as TagPickerComponent } from "./components/tag-picker";
import {
  useDatasetCompletedItems as useDatasetCompletedItemsHook,
  useDatasetReviewItems as useDatasetReviewItemsHook,
} from "./hooks/use-dataset-review-items";
import { useReviewSummary as useReviewSummaryHook } from "./hooks/use-review-summary";
import {
  buildReviewByDatasetMap as buildReviewByDatasetMapImpl,
  buildReviewByExperimentMap as buildReviewByExperimentMapImpl,
  computeReviewTotals as computeReviewTotalsImpl,
} from "./review-maps";
import type {
  ReviewByDataset as ReviewByDatasetType,
  ReviewByExperiment as ReviewByExperimentType,
  ReviewSummary as ReviewSummaryType,
  ReviewTotals as ReviewTotalsType,
} from "./review-maps";
import { BulkTagPicker as BulkTagPickerComponent } from "@/components/features/mastra-studio/upstream/domains/shared/components/bulk-tag-picker";

export const DatasetReview = DatasetReviewComponent;
export const ProposalTag = ProposalTagComponent;
export const ReviewItemCard = ReviewItemCardComponent;
export const ReviewPipelineCard = ReviewPipelineCardComponent;
export const TagPicker = TagPickerComponent;
export const BulkTagPicker = BulkTagPickerComponent;
export const useDatasetCompletedItems = useDatasetCompletedItemsHook;
export const useDatasetReviewItems = useDatasetReviewItemsHook;
export const useReviewSummary = useReviewSummaryHook;
export const buildReviewByDatasetMap = buildReviewByDatasetMapImpl;
export const buildReviewByExperimentMap = buildReviewByExperimentMapImpl;
export const computeReviewTotals = computeReviewTotalsImpl;

export type ReviewByDataset = ReviewByDatasetType;
export type ReviewByExperiment = ReviewByExperimentType;
export type ReviewSummary = ReviewSummaryType;
export type ReviewTotals = ReviewTotalsType;
