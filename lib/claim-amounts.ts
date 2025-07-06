/**
 * Configuration for claim amounts based on Neynar user score
 */
import { createClient } from '@supabase/supabase-js';

export type ScoreTier = 'high' | 'medium_high' | 'medium' | 'medium_low' | 'low' | 'unknown';

export interface ClaimAmountConfig {
  tier: ScoreTier;
  minScore: number;
  maxScore: number;
  amount: number;
  description: string;
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// Cache for claim amounts
let cachedClaimAmounts: ClaimAmountConfig[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fallback configuration (used if database is unavailable)
const FALLBACK_CLAIM_AMOUNTS: ClaimAmountConfig[] = [
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
    maxScore: 0.59999,
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
 * Fetch claim amounts from database with caching
 */
async function fetchClaimAmounts(): Promise<ClaimAmountConfig[]> {
  // Check cache first
  if (cachedClaimAmounts && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedClaimAmounts;
  }

  try {
    const { data, error } = await supabase
      .from('claim_amount_configs')
      .select('*')
      .eq('is_active', true)
      .like('category', 'neynar_%')
      .order('min_score', { ascending: false });

    if (error) {
      console.error('Error fetching claim amounts from database:', error);
      return FALLBACK_CLAIM_AMOUNTS;
    }

    if (!data || data.length === 0) {
      console.warn('No claim amounts found in database, using fallback');
      return FALLBACK_CLAIM_AMOUNTS;
    }

    // Map database records to ClaimAmountConfig format
    const claimAmounts: ClaimAmountConfig[] = data
      .filter(row => row.min_score !== null && row.max_score !== null)
      .map(row => {
        // Map category to tier
        let tier: ScoreTier;
        switch (row.category) {
          case 'neynar_high':
            tier = 'high';
            break;
          case 'neynar_medium_high':
            tier = 'medium_high';
            break;
          case 'neynar_medium':
            tier = 'medium';
            break;
          case 'neynar_medium_low':
            tier = 'medium_low';
            break;
          case 'neynar_low':
            tier = 'low';
            break;
          default:
            tier = 'unknown';
        }

        return {
          tier,
          minScore: parseFloat(row.min_score),
          maxScore: parseFloat(row.max_score),
          amount: row.amount,
          description: row.description || ''
        };
      });

    // Update cache
    cachedClaimAmounts = claimAmounts;
    cacheTimestamp = Date.now();

    return claimAmounts;
  } catch (error) {
    console.error('Error fetching claim amounts:', error);
    return FALLBACK_CLAIM_AMOUNTS;
  }
}

// Export for backward compatibility (synchronous access to cached/fallback data)
export let SCORE_BASED_CLAIM_AMOUNTS: ClaimAmountConfig[] = FALLBACK_CLAIM_AMOUNTS;

// Initialize claim amounts on module load
fetchClaimAmounts().then(amounts => {
  SCORE_BASED_CLAIM_AMOUNTS = amounts;
}).catch(error => {
  console.error('Failed to initialize claim amounts:', error);
});

/**
 * Get claim amount based on Neynar user score (async version)
 * @param score - The Neynar user score (0.0 to 1.0)
 * @returns The claim amount in QR tokens
 */
export async function getClaimAmountByScoreAsync(score: number | undefined | null): Promise<{
  amount: number;
  tier: ScoreTier;
  description: string;
}> {
  // Fetch latest claim amounts from database
  const claimAmounts = await fetchClaimAmounts();

  // If no score is provided, get default amount from database
  if (score === undefined || score === null || isNaN(score)) {
    // Try to get default amount from database
    try {
      const { data } = await supabase
        .from('claim_amount_configs')
        .select('amount')
        .eq('category', 'default')
        .eq('is_active', true)
        .single();
      
      const defaultAmount = data?.amount || DEFAULT_CLAIM_AMOUNT;
      
      return {
        amount: defaultAmount,
        tier: 'unknown',
        description: 'Unknown user quality'
      };
    } catch {
      return {
        amount: DEFAULT_CLAIM_AMOUNT,
        tier: 'unknown',
        description: 'Unknown user quality'
      };
    }
  }

  // Find the appropriate tier based on score
  const config = claimAmounts.find(
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
  try {
    const { data } = await supabase
      .from('claim_amount_configs')
      .select('amount')
      .eq('category', 'default')
      .eq('is_active', true)
      .single();
    
    const defaultAmount = data?.amount || DEFAULT_CLAIM_AMOUNT;
    
    return {
      amount: defaultAmount,
      tier: 'unknown',
      description: 'Unknown user quality'
    };
  } catch {
    return {
      amount: DEFAULT_CLAIM_AMOUNT,
      tier: 'unknown',
      description: 'Unknown user quality'
    };
  }
}

/**
 * Get claim amount based on Neynar user score (sync version for backward compatibility)
 * Uses cached or fallback data
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

  // Find the appropriate tier based on score using cached data
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