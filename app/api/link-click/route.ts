import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';

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
  // Get client IP for logging
  const clientIP = getClientIP(request);
  
  // Rate limiting FIRST: 10 requests per minute per IP (before any processing)
  if (isRateLimited(clientIP, 10, 60000)) {
    console.log(`🚫 RATE LIMITED: IP=${clientIP} (too many link click requests)`);
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }
  
  try {
    // Get request parameters
    const { fid, auctionId, winningUrl, address, username } = await request.json();
    
    // Log all link click attempts with IP
    console.log(`🔗 LINK CLICK: IP=${clientIP}, FID=${fid || 'none'}, auction=${auctionId}, address=${address || 'none'}, username=${username || 'none'}`);
    
    // IMMEDIATE BLOCK for known abuser
    if (fid === 521172 || username === 'nancheng' || address === '0x52d24FEcCb7C546ABaE9e89629c9b417e48FaBD2') {
      console.log(`🚫 BLOCKED ABUSER: IP=${clientIP}, FID=${fid}, username=${username}, address=${address}`);
      return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403 });
    }
    

    
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
      
      // Only allow clicks for the latest won auction (not future auctions)
      const isValidAuction = requestedId === latestWonId;
      
      console.log(`Validating auction link click: requested=${requestedId}, latest won=${latestWonId}, isValid=${isValidAuction}`);
      
      if (!isValidAuction) {
        const errorMessage = `Invalid auction ID - can only click from latest won auction (${latestWonId})`;
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
    
    // Check if this username has already claimed for this specific auction
    if (username) {
      const { data: existingUsernameClaim, error: usernameCheckError } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('username', username)
        .eq('auction_id', auctionId)
        .single();
      
      if (usernameCheckError && usernameCheckError.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('Error checking existing username claim:', usernameCheckError);
        return NextResponse.json({ 
          success: false, 
          error: 'Error checking existing username claims' 
        }, { status: 500 });
      }
      
      if (existingUsernameClaim) {
        console.log(`Username ${username} has already claimed for auction ${auctionId} with FID ${existingUsernameClaim.fid} at ${existingUsernameClaim.link_visited_at}`);
        return NextResponse.json({ 
          success: false, 
          error: `This username has already claimed for auction ${auctionId}`,
          existing_claim_time: existingUsernameClaim.link_visited_at,
          existing_fid: existingUsernameClaim.fid
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
      
      // Check if this is a unique constraint violation on (eth_address, auction_id)
      if (error.code === '23505' && error.message?.includes('link_visit_claims_eth_address_auction_id_unique')) {
        console.log(`Database constraint prevented duplicate claim for address ${address} on auction ${auctionId}`);
        return NextResponse.json({ 
          success: false, 
          error: `This wallet address has already claimed for auction ${auctionId}`,
          details: 'Duplicate claim prevented by database constraint'
        }, { status: 400 });
      }
      
      // Check if this is a unique constraint violation on (username, auction_id)
      if (error.code === '23505' && error.message?.includes('link_visit_claims_username_auction_id_unique')) {
        console.log(`Database constraint prevented duplicate claim for username ${username} on auction ${auctionId}`);
        return NextResponse.json({ 
          success: false, 
          error: `This username has already claimed for auction ${auctionId}`,
          details: 'Duplicate username claim prevented by database constraint'
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Database error' 
      }, { status: 500 });
    }
    
    console.log(`✅ RECORDED CLICK: IP=${clientIP}, user=${username || fid || 'anonymous'}, auction=${auctionId}` + (address ? `, address=${address}` : ''));
    
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