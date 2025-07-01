import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const auctionId = searchParams.get('auctionId');
    const fid = searchParams.get('fid');
    const ethAddress = searchParams.get('ethAddress');
    const username = searchParams.get('username');

    if (!auctionId) {
      return NextResponse.json(
        { success: false, error: 'Auction ID required' },
        { status: 400 }
      );
    }

    if (!fid && !ethAddress) {
      return NextResponse.json(
        { success: false, error: 'Either FID or ETH address required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user has visited the redirect link
    let query = supabase
      .from('redirect_click_tracking')
      .select('id, created_at, username')
      .eq('auction_id', auctionId);

    if (fid) {
      query = query.eq('fid', Number(fid));
    } else if (ethAddress) {
      query = query.eq('eth_address', ethAddress);
    }

    const { data: visitData, error: visitError } = await query.single();


    if (visitError && visitError.code !== 'PGRST116') {
      console.error('Error checking visit status:', visitError);
      return NextResponse.json(
        { success: false, error: 'Failed to check visit status' },
        { status: 500 }
      );
    }

    const hasVisited = !!visitData;

    // Also check if they have already claimed
    let claimQuery = supabase
      .from('link_visit_claims')
      .select('id, tx_hash, success, username')
      .eq('auction_id', auctionId);

    if (fid) {
      claimQuery = claimQuery.eq('fid', Number(fid));
    } else if (ethAddress) {
      claimQuery = claimQuery.eq('eth_address', ethAddress);
    }

    const { data: claimData, error: claimError } = await claimQuery.single();

    if (claimError && claimError.code !== 'PGRST116') {
      console.error('Error checking claim status:', claimError);
      return NextResponse.json(
        { success: false, error: 'Failed to check claim status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        hasVisited,
        visitedAt: visitData?.created_at || null,
        visitUsername: visitData?.username || username || null,
        hasClaimed: !!claimData,
        claimTxHash: claimData?.tx_hash || null,
        claimSuccess: claimData?.success || false,
        claimUsername: claimData?.username || null
      }
    });

  } catch (error) {
    console.error('Error in check-visited:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}