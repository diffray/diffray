/**
 * Stage registry and configuration
 */

import type { Stage } from '../types';
import { createLoadRulesStage } from './load-rules';
import { createMatchRulesStage } from './match-rules';
import { createReviewStage } from './review';
import { createAggregateResultsStage } from './aggregate-results';
import { createConfidenceFilterStage } from './confidence-filter';
import { createDeduplicationStage } from './deduplication';
import { createValidationStage } from './validation';

/**
 * Get all stages in default order
 */
export function getStages(): Stage[] {
  return [
    createLoadRulesStage(),
    createMatchRulesStage(),
    createReviewStage(),
    createAggregateResultsStage(),
    createConfidenceFilterStage(),
    createDeduplicationStage(),
    createValidationStage(),
  ];
}
