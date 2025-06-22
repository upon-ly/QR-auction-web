import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import QRAuctionV3 from '@/abi/QRAuctionV3.json';

const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

const RETRY_ENDPOINT_SECRET = process.env.RETRY_ENDPOINT_SECRET || 'retry-secret-key';
const HOST_URL = process.env.NEXT_PUBLIC_HOST_URL || 'http://localhost:3000';

// RPC setup for contract checks
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

export async function POST(req: NextRequest) {
  try {
    // Get admin authorization
    const { auctionId, adminAddress } = await req.json();
    
    if (!auctionId) {
      return NextResponse.json({ success: false, error: 'Auction ID required' }, { status: 400 });
    }

    if (!adminAddress || !ADMIN_ADDRESSES.includes(adminAddress.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Invalid admin address' }, { status: 401 });
    }

    console.log(`Manual retry triggered by admin ${adminAddress} for auction ${auctionId}`);

    // Security check: Only allow retries for the most recently settled auction
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const auctionContract = new ethers.Contract(
        process.env.NEXT_PUBLIC_QRAuctionV3 as string,
        QRAuctionV3.abi,
        provider
      );
      
      // Get current auction info from contract
      const currentAuction = await auctionContract.auction();
      const currentAuctionId = currentAuction.tokenId - 2n;
      const expectedSettledAuctionId = currentAuctionId; // The auction with claims to retry
      
      console.log(`Admin manual retry: Current auction: ${currentAuctionId + 2n}, Requested: ${auctionId}, Expected auction with claims: ${expectedSettledAuctionId}`);
      
      // Only allow retries for the auction with claims
      if (BigInt(auctionId) !== expectedSettledAuctionId) {
        console.error(`Admin retry security check failed: Can only retry claims for auction ${expectedSettledAuctionId}, requested: ${auctionId}`);
        return NextResponse.json({ 
          success: false, 
          error: `Can only retry claims for auction ${expectedSettledAuctionId.toString()}`,
          currentAuction: (currentAuctionId + 2n).toString(),
          requestedAuction: auctionId,
          allowedAuction: expectedSettledAuctionId.toString()
        }, { status: 403 });
      }
      
      console.log(`Admin retry security check passed: Retrying claims for auction ${auctionId}`);
    } catch (contractError) {
      console.error('Failed to verify auction state for admin retry:', contractError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to verify auction state' 
      }, { status: 500 });
    }

    // Call the retry endpoint
    const retryResponse = await fetch(`${HOST_URL}/api/auction/settled/retry-failures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RETRY_ENDPOINT_SECRET}`
      },
      body: JSON.stringify({
        auctionId: auctionId
      })
    });

    const retryResult = await retryResponse.json();

    if (retryResult.success) {
      return NextResponse.json({
        success: true,
        message: `Manual retry completed for auction ${auctionId}`,
        ...retryResult
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Manual retry failed: ${retryResult.error}`
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Manual retry error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check retry status for an auction
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const auctionId = searchParams.get('auctionId');
    const adminAddress = searchParams.get('adminAddress');

    if (!auctionId) {
      return NextResponse.json({ success: false, error: 'Auction ID required' }, { status: 400 });
    }

    if (!adminAddress || !ADMIN_ADDRESSES.includes(adminAddress.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Unauthorized - Invalid admin address' }, { status: 401 });
    }

    // Setup Supabase client to check failure status
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get failure count for this auction
    const { data: failures, error: fetchError } = await supabase
      .from('link_visit_claim_failures')
      .select('id, fid, created_at, error_message, retry_count')
      .eq('auction_id', auctionId.toString())
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch failure data' 
      }, { status: 500 });
    }

    // Get successful claims count for comparison
    const { data: successfulClaims, error: claimsError } = await supabase
      .from('link_visit_claims')
      .select('id')
      .eq('auction_id', auctionId.toString())
      .eq('success', true);

    if (claimsError) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch claims data' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      auctionId,
      failuresCount: failures?.length || 0,
      successfulClaimsCount: successfulClaims?.length || 0,
      failures: failures || []
    });

  } catch (error) {
    console.error('Retry status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 