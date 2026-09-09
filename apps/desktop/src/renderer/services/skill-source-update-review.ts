import type {
  SkillUpdateSafetyReview,
} from "@prompthub/shared/types";

export class SkillUpdateSafetyReviewRequiredError extends Error {
  constructor(readonly review: SkillUpdateSafetyReview) {
    super("SAFETY_REVIEW_REQUIRED");
  }
}
