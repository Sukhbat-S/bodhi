import type { WorkflowDefinition } from "@seneca/core";
import { morningResearch } from "./morning-research.js";
import { deployVerify } from "./deploy-verify.js";
import { weeklySynthesis } from "./weekly-synthesis.js";
import { tradeReview } from "./trade-review.js";

export const workflowRegistry = new Map<string, WorkflowDefinition>([
  [morningResearch.id, morningResearch],
  [deployVerify.id, deployVerify],
  [weeklySynthesis.id, weeklySynthesis],
  [tradeReview.id, tradeReview],
]);

export { morningResearch, deployVerify, weeklySynthesis, tradeReview };
