import { NextRequest, NextResponse } from 'next/server';
import { getClaimAmountForAddress, checkHistoricalEthBalance } from '@/lib/wallet-balance-checker';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';

// Get Alchemy API key from environment
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';

// Simple in-memory deduplication cache
const pendingRequests = new Map<string, Promise<{ amount: number; neynarScore?: number; hasSpamLabelOverride?: boolean }>>();

// Helper function to create the promise with historical check
async function getClaimAmountWithHistoricalCheck(
  address: string,
  claimSource: string,
  alchemyApiKey: string,
  fid?: number
): Promise<{ amount: number; neynarScore?: number; hasSpamLabelOverride?: boolean }> {
  // Get base claim amount
  let claimResult = await getClaimAmountForAddress(address, claimSource, alchemyApiKey, fid);
  
  // For web users, also check historical balance
  if (claimSource === 'web') {
    try {
      const historicalResult = await checkHistoricalEthBalance(
        address,
        5, // $5 minimum
        90, // 90 days (3 months)
        alchemyApiKey
      );
      
      // Adjust amount based on historical balance
      if (!historicalResult.meetsRequirement) {
        // User doesn't meet historical requirement, give them 100 QR
        claimResult = { ...claimResult, amount: 100 };
        console.log(`📉 Web user doesn't meet historical requirement - reducing to 100 QR`);
      } else {
        // User meets requirement, keep the amount from getClaimAmountForAddress (which uses database value)
        // claimResult already has the correct amount from the database
        console.log(`✅ Web user meets historical requirement - confirming ${claimResult.amount} QR`);
      }
    } catch (error) {
      console.error('Error checking historical balance in check-amount:', error);
      // On error, default to lower tier for safety
      claimResult = { ...claimResult, amount: 100 };
    }
  }
  
  return claimResult;
}

export async function POST(request: NextRequest) {
  // Get client IP for rate limiting
  const clientIP = getClientIP(request);
  
  // Rate limit: 10 requests per minute
  if (isRateLimited(clientIP, 10, 60000)) {
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }
  
  try {
    const { address, claimSource, fid } = await request.json();
    
    // Validate required parameters
    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: 'Invalid address format' }, { status: 400 });
    }
    
    // Create a cache key based on the request parameters
    const cacheKey = `${address}-${claimSource || 'web'}-${fid || 'none'}`;
    
    // Check if we already have a pending request for this exact combination
    if (pendingRequests.has(cacheKey)) {
      console.log(`🔄 Deduplicating request for ${cacheKey}`);
      const claimResult = await pendingRequests.get(cacheKey)!;
      return NextResponse.json({ 
        success: true, 
        amount: claimResult.amount,
        source: claimSource || 'web',
        deduplicated: true,
        neynarScore: claimResult.neynarScore,
        hasSpamLabelOverride: claimResult.hasSpamLabelOverride
      });
    }
    
    // Create a new promise for this request using the helper function that includes historical check
    const claimPromise = getClaimAmountWithHistoricalCheck(
      address,
      claimSource || 'web',
      ALCHEMY_API_KEY,
      fid
    );
    
    // Store the promise in our cache
    pendingRequests.set(cacheKey, claimPromise);
    
    // Clean up the cache after the request completes
    claimPromise.finally(() => {
      // Remove from cache after a short delay to catch immediate duplicates
      setTimeout(() => {
        pendingRequests.delete(cacheKey);
      }, 100);
    });
    
    // Wait for the result
    const claimResult = await claimPromise;
    
    return NextResponse.json({ 
      success: true, 
      amount: claimResult.amount,
      source: claimSource || 'web',
      neynarScore: claimResult.neynarScore,
      hasSpamLabelOverride: claimResult.hasSpamLabelOverride
    });
    
  } catch (error) {
    console.error('Error checking claim amount:', error);
    
    // Return 0 to indicate unknown amount - UI should show generic message
    const claimSource = 'web'; // Default to web if we can't determine
    const defaultAmount = 0; // Don't show misleading amounts when there's an error
    
    return NextResponse.json({ 
      success: true, 
      amount: defaultAmount,
      source: claimSource,
      defaulted: true, // Indicate we're using default due to error
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
}