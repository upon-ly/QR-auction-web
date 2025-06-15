import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/auth';
import type { Database } from '@/types/database';

// Use service role key for admin operations
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // This bypasses RLS
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET() {
  try {
    // Get recent winners for debugging
    const { data, error } = await supabaseAdmin
      .from('winners')
      .select('*')
      .order('token_id', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching winners:', error);
      return NextResponse.json({ error: 'Failed to fetch winners' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in GET /api/winners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if this is an automated blockchain event call (no auth header)
    // or an admin manual call (requires auth)
    const authHeader = req.headers.get('authorization');
    
    if (authHeader) {
      // If auth header is present, verify admin authentication using Privy JWT
      const authResult = await verifyAdminAuth(authHeader);
      
      if (!authResult.isValid) {
        return NextResponse.json({ 
          error: authResult.error || 'Authentication required' 
        }, { status: 401 });
      }
    }
    // If no auth header, allow automated blockchain calls to proceed
    
    const winnerData = await req.json();
    
    // Validate required fields
    if (!winnerData.tokenId || !winnerData.winnerAddress || !winnerData.amount) {
      return NextResponse.json({ 
        error: 'Missing required fields: tokenId, winnerAddress, amount' 
      }, { status: 400 });
    }

    // Convert tokenId to number for consistency
    const tokenId = parseInt(winnerData.tokenId);
    
    // Check if winner already exists for this auction
    const { data: existingWinner } = await supabaseAdmin
      .from('winners')
      .select('token_id')
      .eq('token_id', tokenId)
      .single();

    if (existingWinner) {
      console.log(`Winner already exists for auction ${tokenId}, skipping insertion`);
      return NextResponse.json({ 
        success: true, 
        message: 'Winner already exists',
        data: existingWinner 
      });
    }

    // Insert new winner
    const { data, error } = await supabaseAdmin
      .from('winners')
      .insert({
        token_id: tokenId,
        winner_address: winnerData.winnerAddress,
        amount: winnerData.amount,
        url: winnerData.url || null,
        display_name: winnerData.displayName || null,
        farcaster_username: winnerData.farcasterUsername || null,
        twitter_username: winnerData.twitterUsername || null,
        basename: winnerData.basename || null,
        usd_value: winnerData.usdValue || null,
        is_v1_auction: winnerData.isV1Auction || false,
        ens_name: winnerData.ensName || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting winner:', error);
      return NextResponse.json({ error: 'Failed to insert winner' }, { status: 500 });
    }

    console.log(`Successfully inserted winner for auction ${tokenId}:`, data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in POST /api/winners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 