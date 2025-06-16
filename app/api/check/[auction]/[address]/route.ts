import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PrivyClient } from '@privy-io/server-auth';

// Initialize Privy client for server-side authentication
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  process.env.PRIVY_APP_SECRET || ''
);

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database reads may fail due to RLS');
}

interface RouteParams {
  auction: string;
  address: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    // Optional API key validation (if you want to secure this endpoint)
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.LINK_CLICK_API_KEY;
    
    // Only validate API key if one is configured
    if (validApiKey && (!apiKey || apiKey !== validApiKey)) {
      console.error(`🚨 UNAUTHORIZED CHECK API ACCESS`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { auction, address } = await params;
    
    if (!address) {
      return NextResponse.json({ 
        error: 'Invalid address' 
      }, { status: 400 });
    }

    // Validate that address looks like an Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ 
        error: 'Invalid Ethereum address format' 
      }, { status: 400 });
    }

    // Verify Privy authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        error: 'Authentication required. Please provide auth token.' 
      }, { status: 401 });
    }

    const authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify the Privy auth token and extract userId
    let verifiedPrivyId: string;
    try {
      const verifiedClaims = await privyClient.verifyAuthToken(authToken);
      
      if (!verifiedClaims.userId) {
        throw new Error('No user ID in token claims');
      }
      
      verifiedPrivyId = verifiedClaims.userId;
      console.log(`✅ MOBILE LINK VISIT CHECK AUTH: Verified Privy User: ${verifiedPrivyId}`);
      
    } catch (error) {
      console.log(`🚫 MOBILE LINK VISIT CHECK AUTH ERROR: Invalid auth token:`, error);
      return NextResponse.json({ 
        error: 'Invalid authentication. Please sign in again.' 
      }, { status: 401 });
    }

    console.log(`🔍 CHECKING MOBILE LINK VISIT ELIGIBILITY: auction=${auction}, address=${address}, privyId=${verifiedPrivyId}`);

    // Check if this user has already claimed mobile link visit tokens for this auction
    // Only check by privy_id and eth_address for mobile-link-visit claims
    const { data: existingClaims, error: checkError } = await supabase
      .from('link_visit_claims')
      .select('*')
      .eq('auction_id', auction)
      .eq('claim_source', 'mobile')
      .or(`eth_address.eq.${address},user_id.eq.${verifiedPrivyId}`)
      .not('claimed_at', 'is', null);
    
    if (checkError) {
      console.error('Error checking mobile link visit claims:', checkError);
      return NextResponse.json({ 
        error: 'Database error checking mobile link visit claims' 
      }, { status: 500 });
    }

    const hasClaimed = existingClaims && existingClaims.length > 0;
    const canClaim = !hasClaimed;

    // Determine what type of match was found
    let matchReason = null;
    let matchedClaim = null;
    
    if (hasClaimed) {
      matchedClaim = existingClaims[0];
      
      // Determine match type for mobile-link-visit
      if (matchedClaim.eth_address === address && matchedClaim.user_id === verifiedPrivyId) {
        matchReason = 'SAME_USER_AND_ADDRESS';
      } else if (matchedClaim.user_id === verifiedPrivyId) {
        matchReason = 'SAME_USER_DIFFERENT_ADDRESS';
      } else if (matchedClaim.eth_address === address) {
        matchReason = 'SAME_ADDRESS_DIFFERENT_USER';
      } else {
        matchReason = 'CLAIMED';
      }
    }

    const result = {
      eligible: canClaim,
      hasClaimed,
      auction,
      address,
      privyId: verifiedPrivyId,
      claimSource: 'mobile',
      matchReason,
      claimDetails: hasClaimed ? {
        claimedAt: matchedClaim.claimed_at,
        txHash: matchedClaim.tx_hash,
        privyId: matchedClaim.user_id,
        ethAddress: matchedClaim.eth_address,
        amount: matchedClaim.amount,
        claimSource: matchedClaim.claim_source
      } : null
    };

    console.log(`✅ MOBILE LINK VISIT ELIGIBILITY: auction=${auction}, address=${address}, privyId=${verifiedPrivyId}:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking link visit claim eligibility:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 