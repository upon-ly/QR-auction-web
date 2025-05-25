import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database writes may fail due to RLS');
}

export async function POST(request: NextRequest) {
  try {
    // Get request parameters
    const { fid, auctionId, winningUrl, address, username } = await request.json();
    
    if (!auctionId || !winningUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    // Validate that this is the latest settled auction
    try {
      // Get the latest won auction from winners table
      const { data: latestWinner, error } = await supabase
        .from('winners')
        .select('token_id')
        .order('token_id', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching latest won auction:', error);
        return NextResponse.json({ 
          success: false, 
          error: 'Error validating auction ID' 
        }, { status: 500 });
      }
      
      if (!latestWinner || latestWinner.length === 0) {
        console.error('No won auctions found');
        return NextResponse.json({ 
          success: false, 
          error: 'No won auctions found' 
        }, { status: 400 });
      }
      
      const latestWonId = parseInt(latestWinner[0].token_id);
      const requestedId = parseInt(auctionId);
      
      // Only allow clicks for the latest won auction or the next auction
      const isValidAuction = requestedId === latestWonId || requestedId === latestWonId + 1;
      
      console.log(`Validating auction link click: requested=${requestedId}, latest won=${latestWonId}, isValid=${isValidAuction}`);
      
      if (!isValidAuction) {
        const errorMessage = `Invalid auction ID - can only click from latest won auction (${latestWonId}) or the next one (${latestWonId + 1})`;
        console.error(errorMessage);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
      }
    } catch (error) {
      console.error('Error validating auction ID:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Error validating auction ID' 
      }, { status: 500 });
    }
    
    // If no FID (not in a frame context), still record the click but with null FID
    // This handles visitors from outside of frames
    
    // Check if this address has already claimed for this specific auction
    if (address) {
      const { data: existingClaim, error: claimCheckError } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('eth_address', address)
        .eq('auction_id', auctionId)
        .single();
      
      if (claimCheckError && claimCheckError.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('Error checking existing claim:', claimCheckError);
        return NextResponse.json({ 
          success: false, 
          error: 'Error checking existing claims' 
        }, { status: 500 });
      }
      
      if (existingClaim) {
        console.log(`Address ${address} has already claimed for auction ${auctionId} at ${existingClaim.link_visited_at}`);
        return NextResponse.json({ 
          success: false, 
          error: `This wallet address has already claimed for auction ${auctionId}`,
          existing_claim_time: existingClaim.link_visited_at
        }, { status: 400 });
      }
    }
    
    // Record the click in our database
    const { error } = await supabase
      .from('link_visit_claims')
      .upsert({
        fid: fid || null,
        auction_id: auctionId,
        winning_url: winningUrl,
        link_visited_at: new Date().toISOString(),
        eth_address: address || null,
        username: username || null // Add username
      }, {
        onConflict: fid ? 'fid,auction_id' : undefined
      });
    
    if (error) {
      console.error('Error recording link click:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Database error' 
      }, { status: 500 });
    }
    
    console.log(`Recorded click for user ${username || fid || 'anonymous'} on auction ${auctionId}` + (address ? ` with address ${address}` : ''));
    
    return NextResponse.json({ 
      success: true, 
      message: 'Link click recorded successfully' 
    });
  } catch (error) {
    console.error('Error processing link click:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 