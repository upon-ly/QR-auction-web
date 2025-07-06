import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database reads may fail due to RLS');
}

// Admin wallet addresses for authorization
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

// Define types for database tables
interface Winner {
  token_id: number;
  usd_value: number;
  created_at: string;
}

interface HistoricalQRPrice {
  auction_id: number;
  qr_price_usd: number;
}

export async function GET(request: Request) {
  try {
    // Get the connected wallet address from headers
    const authHeader = request.headers.get('authorization');
    const walletAddress = authHeader?.replace('Bearer ', '').toLowerCase();

    // Check if the request is from an admin
    if (!walletAddress || !ADMIN_ADDRESSES.includes(walletAddress)) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // First, find the earliest auction ID in the link_visit_claims table
    const { data: minAuctionData, error: minAuctionError } = await supabase
      .from('link_visit_claims')
      .select('auction_id')
      .order('auction_id', { ascending: true })
      .limit(1);

    if (minAuctionError) {
      console.error('Error finding earliest auction ID:', minAuctionError);
      return new NextResponse(JSON.stringify({ error: 'Failed to find earliest auction with link visits' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If we didn't find any records, return empty data
    if (!minAuctionData || minAuctionData.length === 0) {
      return new NextResponse(JSON.stringify({ 
        auctionData: [],
        stats: {
          totalAuctions: 0,
          auctionsWithClicks: 0,
          totalClicks: 0,
          totalUsdValue: 0,
          minAuctionId: 0,
          maxAuctionId: 0
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const earliestAuctionId = minAuctionData[0].auction_id;
    console.log(`Earliest auction ID with link visits: ${earliestAuctionId}`);

    // Get all winning bids with USD values starting from the earliest auction with link visits
    const { data: winnersData, error: winnersError } = await supabase
      .from('winners')
      .select('token_id, usd_value, created_at')
      .gte('token_id', earliestAuctionId)
      .order('token_id', { ascending: true })
      .not('usd_value', 'is', null)
      .limit(1000);

    if (winnersError) {
      console.error('Error fetching winners data:', winnersError);
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch winners data' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all QR prices for these auctions
    const auctionIds = (winnersData as Winner[]).map(w => w.token_id);
    const { data: qrPricesData, error: qrPricesError } = await supabase
      .from('historical_qr_prices')
      .select('auction_id, qr_price_usd')
      .in('auction_id', auctionIds);

    if (qrPricesError) {
      console.error('Error fetching QR prices:', qrPricesError);
    }

    // Create a map of auction_id to QR price for easy lookup
    const qrPriceMap = new Map<number, number>();
    if (qrPricesData) {
      (qrPricesData as HistoricalQRPrice[]).forEach(price => {
        qrPriceMap.set(price.auction_id, Number(price.qr_price_usd));
      });
    }

    // Initialize the result array
    const auctionData = [];
    let totalClicks = 0;
    
    // Get all click counts in one query using aggregation
    const { data: clickData, error: clickError } = await supabase
      .from('link_visit_claims')
      .select(`
        auction_id,
        claim_source,
        spam_label,
        neynar_user_score,
        amount,
        success
      `)
      .gte('auction_id', earliestAuctionId);

    if (clickError) {
      console.error('Error fetching click data:', clickError);
      return new NextResponse(JSON.stringify({ error: 'Failed to fetch click data' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Aggregate click data by auction_id and source
    const clickMap = new Map();
    const neynarScoreData = new Map();
    const qrAmountData = new Map(); // Track total QR distributed per auction
    
    clickData?.forEach(click => {
      const auctionId = click.auction_id;
      if (!clickMap.has(auctionId)) {
        clickMap.set(auctionId, { 
          total: 0, 
          web: 0, 
          mini_app: 0,
          mini_app_spam: 0,
          mini_app_valid: 0 
        });
        neynarScoreData.set(auctionId, {
          score_0_20: 0,
          score_20_40: 0,
          score_40_60: 0,
          score_60_80: 0,
          score_80_100: 0,
          score_unknown: 0
        });
        qrAmountData.set(auctionId, {
          totalQR: 0,
          successfulClaims: 0
        });
      }
      const counts = clickMap.get(auctionId);
      const scoreData = neynarScoreData.get(auctionId);
      const qrData = qrAmountData.get(auctionId);
      
      counts.total++;
      
      // Track QR amounts for successful claims
      if (click.success === true && click.amount) {
        qrData.totalQR += click.amount;
        qrData.successfulClaims++;
      }
      if (click.claim_source === 'web') {
        counts.web++;
      }
      if (click.claim_source === 'mini_app') {
        counts.mini_app++;
        // Count spam vs valid for mini app claims
        if (click.spam_label === true) {
          counts.mini_app_spam++;
        } else if (click.spam_label === false) {
          counts.mini_app_valid++;
        }
        // If spam_label is null, it's neither counted as spam nor valid
        
        // Count Neynar score distribution
        if (click.neynar_user_score === null || click.neynar_user_score === undefined) {
          scoreData.score_unknown++;
        } else if (click.neynar_user_score < 0.2) {
          scoreData.score_0_20++;
        } else if (click.neynar_user_score < 0.4) {
          scoreData.score_20_40++;
        } else if (click.neynar_user_score < 0.6) {
          scoreData.score_40_60++;
        } else if (click.neynar_user_score < 0.8) {
          scoreData.score_60_80++;
        } else {
          scoreData.score_80_100++;
        }
      }
    });

    // For each auction ID, use pre-aggregated data
    for (const winner of winnersData as Winner[]) {
      const auction_id = winner.token_id;
      
      // Get the click counts from our aggregated data
      const clickCounts = clickMap.get(auction_id) || { 
        total: 0, 
        web: 0, 
        mini_app: 0,
        mini_app_spam: 0,
        mini_app_valid: 0 
      };
      const scoreDistribution = neynarScoreData.get(auction_id) || {
        score_0_20: 0,
        score_20_40: 0,
        score_40_60: 0,
        score_60_80: 0,
        score_80_100: 0,
        score_unknown: 0
      };
      const click_count = clickCounts.total;
      const web_click_count = clickCounts.web;
      const mini_app_click_count = clickCounts.mini_app;
      const mini_app_spam_claims = clickCounts.mini_app_spam;
      const mini_app_valid_claims = clickCounts.mini_app_valid;
      
      totalClicks += click_count;
      
      // Get QR price for this auction (default to 0.01 if not found)
      const qr_price_usd = qrPriceMap.get(auction_id) || 0.01;
      
      // Calculate actual QR reward per claim from real data
      const qrData = qrAmountData.get(auction_id) || { totalQR: 0, successfulClaims: 0 };
      const qr_reward_per_claim = qrData.successfulClaims > 0 ? qrData.totalQR / qrData.successfulClaims : 0;
      
      // Calculate QR reward value in USD
      const qr_reward_value_usd = qr_reward_per_claim * qr_price_usd;
      
      // Calculate cost per click (if there are clicks)
      const cost_per_click = click_count > 0 ? winner.usd_value / click_count : 0;
      
      // Calculate cost per claim (winning bid USD / claims - QR reward value)
      const cost_per_claim = click_count > 0 ? (winner.usd_value / click_count) - qr_reward_value_usd : 0;
      
      auctionData.push({
        auction_id,
        date: format(new Date(winner.created_at), 'MMM d, yyyy'),
        usd_value: winner.usd_value,
        click_count,
        web_click_count,
        mini_app_click_count,
        mini_app_spam_claims,
        mini_app_valid_claims,
        neynar_score_0_20: scoreDistribution.score_0_20,
        neynar_score_20_40: scoreDistribution.score_20_40,
        neynar_score_40_60: scoreDistribution.score_40_60,
        neynar_score_60_80: scoreDistribution.score_60_80,
        neynar_score_80_100: scoreDistribution.score_80_100,
        neynar_score_unknown: scoreDistribution.score_unknown,
        cost_per_click,
        qr_price_usd,
        qr_reward_per_claim,
        qr_reward_value_usd,
        cost_per_claim
      });
    }
    
    // Calculate additional stats about the dataset
    const stats = {
      totalAuctions: auctionData.length,
      auctionsWithClicks: auctionData.filter(item => item.click_count > 0).length,
      totalClicks: totalClicks,
      totalUsdValue: auctionData.reduce((sum, item) => sum + item.usd_value, 0),
      minAuctionId: Math.min(...auctionData.map(item => item.auction_id)),
      maxAuctionId: Math.max(...auctionData.map(item => item.auction_id)),
      earliestAuctionIdWithClicks: earliestAuctionId
    };
    
    return new NextResponse(JSON.stringify({ 
      auctionData,
      stats
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST endpoint to update QR price for an auction
export async function POST(request: Request) {
  try {
    // Get the connected wallet address from headers
    const authHeader = request.headers.get('authorization');
    const walletAddress = authHeader?.replace('Bearer ', '').toLowerCase();

    // Check if the request is from an admin
    if (!walletAddress || !ADMIN_ADDRESSES.includes(walletAddress)) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { auction_id, qr_price_usd } = body;

    if (!auction_id || qr_price_usd === undefined) {
      return new NextResponse(JSON.stringify({ error: 'Missing required fields' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert the QR price for this auction
    const { data, error } = await supabase
      .from('historical_qr_prices')
      .upsert({ 
        auction_id, 
        qr_price_usd,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'auction_id'
      })
      .select();

    if (error) {
      console.error('Error updating QR price:', error);
      return new NextResponse(JSON.stringify({ error: 'Failed to update QR price' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new NextResponse(JSON.stringify({ 
      success: true,
      data: data[0]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}