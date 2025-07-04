/**
 * Configuration for claim amounts based on Neynar user score
 */

export type ScoreTier = 'high' | 'medium_high' | 'medium' | 'medium_low' | 'low' | 'unknown';

export interface ClaimAmountConfig {
  tier: ScoreTier;
  minScore: number;
  maxScore: number;
  amount: number;
  description: string;
}

// Claim amount configuration based on Neynar user score
export const SCORE_BASED_CLAIM_AMOUNTS: ClaimAmountConfig[] = [
  {
    tier: 'high',
    minScore: 0.8,
    maxScore: 1.0,
    amount: 1000,
    description: 'High quality user'
  },
  {
    tier: 'medium_high',
    minScore: 0.6,
    maxScore: 0.8,
    amount: 1000,
    description: 'Medium-high quality user'
  },
  {
    tier: 'medium',
    minScore: 0.4,
    maxScore: 0.6,
    amount: 100,
    description: 'Medium quality user'
  },
  {
    tier: 'medium_low',
    minScore: 0.2,
    maxScore: 0.4,
    amount: 100,
    description: 'Medium-low quality user'
  },
  {
    tier: 'low',
    minScore: 0.0,
    maxScore: 0.2,
    amount: 100,
    description: 'Low quality user'
  }
];

// Default amount for users without a score
export const DEFAULT_CLAIM_AMOUNT = 100;

/**
 * Get claim amount based on Neynar user score
 * @param score - The Neynar user score (0.0 to 1.0)
 * @returns The claim amount in QR tokens
 */
export function getClaimAmountByScore(score: number | undefined | null): {
  amount: number;
  tier: ScoreTier;
  description: string;
} {
  // If no score is provided, return default amount
  if (score === undefined || score === null || isNaN(score)) {
    return {
      amount: DEFAULT_CLAIM_AMOUNT,
      tier: 'unknown',
      description: 'Unknown user quality'
    };
  }

  // Find the appropriate tier based on score
  const config = SCORE_BASED_CLAIM_AMOUNTS.find(
    tier => score >= tier.minScore && score <= tier.maxScore
  );

  if (config) {
    return {
      amount: config.amount,
      tier: config.tier,
      description: config.description
    };
  }

  // Fallback to default if score doesn't match any tier
  return {
    amount: DEFAULT_CLAIM_AMOUNT,
    tier: 'unknown',
    description: 'Unknown user quality'
  };
}

/**
 * Format claim amount for display
 * @param amount - The claim amount
 * @returns Formatted string with comma separator
 */
export function formatClaimAmount(amount: number): string {
  return amount.toLocaleString();
}