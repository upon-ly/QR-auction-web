/**
 * Format QR token amounts with appropriate short notations like 1M, 2.5K etc.
 * @param amount The amount in QR tokens (as a number)
 * @returns Formatted string
 */
export function formatQRAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  } else {
    return amount.toString();
  }
}

/**
 * Format USD value for display
 * @param amount USD value
 * @returns Formatted currency string
 */
export function formatUsdValue(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(amount);
} 