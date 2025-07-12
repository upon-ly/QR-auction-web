import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import { isAdminAddress } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header (wallet address)
    const authHeader = request.headers.get('authorization');
    const walletAddress = authHeader?.replace('Bearer ', '');

    // Check if the wallet address is authorized
    if (!walletAddress || !isAdminAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 403 }
      );
    }

    // Get redirect click data
    const { data: clickData, error: clickError } = await supabase
      .from('redirect_click_tracking')
      .select(`
        auction_id,
        created_at,
        ip_address
      `);

    if (clickError) {
      console.error('Error fetching redirect click data:', clickError);
      return NextResponse.json(
        { error: 'Failed to fetch click data' },
        { status: 500 }
      );
    }

    // Get winners data  
    const { data: winnersData, error: winnersError } = await supabase
      .from('winners')
      .select(`
        token_id,
        created_at,
        amount,
        winner_address,
        usd_value
      `);

    if (winnersError) {
      console.error('Error fetching winners data:', winnersError);
      return NextResponse.json(
        { error: 'Failed to fetch winners data' },
        { status: 500 }
      );
    }

    // Process click data to get counts per auction
    const clickCounts = new Map();
    clickData?.forEach(click => {
      const auctionId = click.auction_id;
      if (!clickCounts.has(auctionId)) {
        clickCounts.set(auctionId, {
          total_clicks: 0,
          unique_ips: new Set()
        });
      }
      
      const metrics = clickCounts.get(auctionId);
      metrics.total_clicks++;
      metrics.unique_ips.add(click.ip_address);
    });

    // Find the earliest auction with click data
    const earliestAuctionWithClicks = clickCounts.size > 0 
      ? Math.min(...Array.from(clickCounts.keys())) 
      : null;

    // Combine winners data with click counts
    const auctionData = winnersData?.map(winner => {
      const clickMetrics = clickCounts.get(winner.token_id) || { total_clicks: 0, unique_ips: new Set() };
      
      // Calculate USD value from the winner data
      let usdValue = 0;
      if (winner.usd_value) {
        usdValue = Number(winner.usd_value);
      } else if (winner.amount) {
        // If no USD value, use a reasonable fallback
        usdValue = Number(winner.amount) * 2500; // Approximate fallback
      }

      const clickCount = clickMetrics.total_clicks;
      const costPerClick = clickCount > 0 ? usdValue / clickCount : 0;

      return {
        auction_id: winner.token_id,
        date: winner.created_at ? new Date(winner.created_at).toLocaleDateString() : 'Unknown',
        usd_value: usdValue,
        click_count: clickCount,
        unique_clicks: clickMetrics.unique_ips.size,
        cost_per_click: costPerClick,
        winning_address: winner.winner_address
      };
    }) || [];

    // Filter to only include auctions from the earliest auction with clicks onwards
    const filteredAuctionData = earliestAuctionWithClicks 
      ? auctionData.filter(auction => auction.auction_id >= earliestAuctionWithClicks)
      : auctionData;

    // Sort by auction ID
    filteredAuctionData.sort((a, b) => a.auction_id - b.auction_id);

    // Calculate stats
    const totalAuctions = filteredAuctionData.length;
    const auctionsWithClicks = filteredAuctionData.filter(a => a.click_count > 0).length;
    const totalClicks = filteredAuctionData.reduce((sum, a) => sum + a.click_count, 0);
    const totalUsdValue = filteredAuctionData.reduce((sum, a) => sum + a.usd_value, 0);
    const minAuctionId = filteredAuctionData.length > 0 ? Math.min(...filteredAuctionData.map(a => a.auction_id)) : 0;
    const maxAuctionId = filteredAuctionData.length > 0 ? Math.max(...filteredAuctionData.map(a => a.auction_id)) : 0;

    const stats = {
      totalAuctions,
      auctionsWithClicks,
      totalClicks,
      totalUsdValue,
      minAuctionId,
      maxAuctionId,
      earliestAuctionIdWithClicks: earliestAuctionWithClicks || minAuctionId
    };

    return NextResponse.json({
      auctionData: filteredAuctionData,
      stats
    });

  } catch (error) {
    console.error('Error in redirect-cost-per-click API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 