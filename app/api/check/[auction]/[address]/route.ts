import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    const { address } = await params;
    
    // Get privy_id from query parameters
    const { searchParams } = new URL(request.url);
    const privyId = searchParams.get('privy_id');
    
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

    console.log(`🔍 CHECKING WELCOME CLAIM ELIGIBILITY: address=${address}, privyId=${privyId || 'not provided'}`);

    // Check if this address or privy_id has already claimed welcome tokens
    let query = supabase
      .from('welcome_claims')
      .select('*');
    
    if (privyId) {
      // Check both eth_address and privy_id
      query = query.or(`eth_address.eq.${address},privy_id.eq.${privyId}`);
    } else {
      // Only check eth_address
      query = query.eq('eth_address', address);
    }
    
    const { data: welcomeClaims, error: welcomeError } = await query;
    
    if (welcomeError) {
      console.error('Error checking welcome claims:', welcomeError);
      return NextResponse.json({ 
        error: 'Database error checking welcome claims' 
      }, { status: 500 });
    }

    // Determine eligibility - simple: if no existing claim, they're eligible
    const hasClaimed = welcomeClaims && welcomeClaims.length > 0;
    const canClaim = !hasClaimed;

    // Determine what type of match was found
    let matchReason = null;
    if (hasClaimed && welcomeClaims[0]) {
      const claim = welcomeClaims[0];
      if (privyId && claim.privy_id === privyId && claim.eth_address === address) {
        matchReason = 'SAME_USER_AND_ADDRESS';
      } else if (privyId && claim.privy_id === privyId) {
        matchReason = 'SAME_USER_DIFFERENT_ADDRESS';
      } else if (claim.eth_address === address) {
        matchReason = 'SAME_ADDRESS';
      }
    }

    const result = {
      eligible: canClaim,
      hasClaimed,
      address,
      privyId: privyId || null,
      matchReason,
      claimDetails: hasClaimed ? {
        claimedAt: welcomeClaims[0].created_at,
        txHash: welcomeClaims[0].tx_hash,
        privyId: welcomeClaims[0].privy_id,
        ethAddress: welcomeClaims[0].eth_address
      } : null
    };

    console.log(`✅ WELCOME CLAIM ELIGIBILITY: ${address}:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking claim eligibility:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 