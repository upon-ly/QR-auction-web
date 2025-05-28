import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header (wallet address)
    const authHeader = request.headers.get('authorization');
    const walletAddress = authHeader?.replace('Bearer ', '');

    // Check if the wallet address is authorized
    if (!walletAddress || !ADMIN_ADDRESSES.includes(walletAddress.toLowerCase())) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 403 }
      );
    }

    // Get auction data with click counts and unique IP counts
    const { data: auctionData, error: auctionError } = await supabase
      .from('redirect_click_tracking')
      .select(`
        auction_id,
        created_at,
        ip_address,
        click_source
      `);

    if (auctionError) {
      console.error('Error fetching redirect click data:', auctionError);
      return NextResponse.json(
        { error: 'Failed to fetch click data' },
        { status: 500 }
      );
    }

    // Process the data to get aggregated metrics by auction
    const auctionMetrics = new Map();
    
    auctionData?.forEach(click => {
      const auctionId = click.auction_id;
      
      if (!auctionMetrics.has(auctionId)) {
        auctionMetrics.set(auctionId, {
          auction_id: auctionId,
          total_clicks: 0,
          unique_ips: new Set(),
          click_sources: {
            qr_arrow: 0,
            winner_link: 0,
            winner_image: 0,
            popup_button: 0,
            popup_image: 0
          },
          first_click: click.created_at,
          last_click: click.created_at
        });
      }
      
      const metrics = auctionMetrics.get(auctionId);
      metrics.total_clicks++;
      metrics.unique_ips.add(click.ip_address);
      
      if (click.click_source && metrics.click_sources.hasOwnProperty(click.click_source)) {
        metrics.click_sources[click.click_source]++;
      }
      
      // Update first/last click times
      if (new Date(click.created_at) < new Date(metrics.first_click)) {
        metrics.first_click = click.created_at;
      }
      if (new Date(click.created_at) > new Date(metrics.last_click)) {
        metrics.last_click = click.created_at;
      }
    });

    // Convert to array and add unique IP count
    const processedData = Array.from(auctionMetrics.values()).map(metrics => ({
      auction_id: metrics.auction_id,
      total_clicks: metrics.total_clicks,
      unique_clicks: metrics.unique_ips.size,
      click_sources: metrics.click_sources,
      first_click: metrics.first_click,
      last_click: metrics.last_click,
      date: new Date(metrics.first_click).toLocaleDateString()
    }));

    // Sort by auction ID
    processedData.sort((a, b) => a.auction_id - b.auction_id);

    // Calculate overall stats
    const stats = {
      totalAuctions: processedData.length,
      auctionsWithClicks: processedData.filter(a => a.total_clicks > 0).length,
      totalClicks: processedData.reduce((sum, a) => sum + a.total_clicks, 0),
      totalUniqueClicks: processedData.reduce((sum, a) => sum + a.unique_clicks, 0),
      minAuctionId: processedData.length > 0 ? Math.min(...processedData.map(a => a.auction_id)) : 0,
      maxAuctionId: processedData.length > 0 ? Math.max(...processedData.map(a => a.auction_id)) : 0,
      earliestAuctionIdWithClicks: processedData.find(a => a.total_clicks > 0)?.auction_id || 0
    };

    return NextResponse.json({
      auctionData: processedData,
      stats
    });

  } catch (error) {
    console.error('Error in redirect-click-analytics API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 