import "server-only";

export type ProductFlags = {
  showFitness: boolean;
  showCareer: boolean;
};

/**
 * Fitness and Career are parked, not deleted. They stay off unless an operator
 * deliberately restores either legacy product for a rollback or data review.
 */
export function productFlags(): ProductFlags {
  return {
    showFitness: process.env.SHOW_FITNESS_PRODUCT === "true",
    showCareer: process.env.SHOW_CAREER_PRODUCT === "true",
  };
}
