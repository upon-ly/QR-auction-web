/**
 * Immediate retry utility for wallet busy scenarios
 * Attempts to get a wallet lock with short delays before falling back to queue
 */

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if it's not a wallet busy error
      if (!error || typeof error !== 'object' || !('message' in error)) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : '';
      if (!errorMessage.includes('Wallet busy') && !errorMessage.includes('already using')) {
        throw error;
      }
      
      // Don't delay on the last attempt
      if (attempt < maxAttempts - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt); // Exponential backoff
        await delay(delayMs);
      }
    }
  }
  
  throw lastError!;
} 