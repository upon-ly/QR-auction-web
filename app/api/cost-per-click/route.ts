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
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

// Define types for database tables
interface Winner {
  token_id: number;
  usd_value: number;
  created_at: string;
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

    // Initialize the result array
    const auctionData = [];
    let totalClicks = 0;
    
    // For each auction ID, get the exact count
    for (const winner of winnersData as Winner[]) {
      const auction_id = winner.token_id;
      
      // Get the count for this specific auction_id
      // This is equivalent to: SELECT COUNT(*) FROM public.link_visit_claims WHERE auction_id = '71'
      const { count, error: countError } = await supabase
        .from('link_visit_claims')
        .select('*', { count: 'exact', head: true })
        .eq('auction_id', auction_id);
      
      if (countError) {
        console.error(`Error counting clicks for auction ID ${auction_id}:`, countError);
        continue; // Skip this auction if count fails
      }
      
      // The count value is exactly what we need
      let click_count = count || 0;
      
      // Add hardcoded click counts for specific auction IDs
      if (auction_id === 71) {
        click_count += 710; // Add 710 hardcoded clicks for auction 71
        console.log(`Added 710 hardcoded clicks to auction ID 71, total: ${click_count}`);
      } else if (auction_id === 72) {
        click_count += 494; // Add 494 hardcoded clicks for auction 72
        console.log(`Added 494 hardcoded clicks to auction ID 72, total: ${click_count}`);
      } else if (auction_id === 73) {
        click_count += 430; // Add 430 hardcoded clicks for auction 73
        console.log(`Added 430 hardcoded clicks to auction ID 73, total: ${click_count}`);
      }
      
      totalClicks += click_count;
      
      // Calculate cost per click (if there are clicks)
      const cost_per_click = click_count > 0 ? winner.usd_value / click_count : 0;
      
      auctionData.push({
        auction_id,
        date: format(new Date(winner.created_at), 'MMM d, yyyy'),
        usd_value: winner.usd_value,
        click_count,
        cost_per_click
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