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
    const { fid, auctionId, winningUrl, address, username, claimSource } = await request.json();
    
    // Log all link click attempts with IP
    console.log(`🔗 LINK CLICK: IP=${clientIP}, FID=${fid || 'none'}, auction=${auctionId}, address=${address || 'none'}, username=${username || 'none'}, source=${claimSource || 'mini_app'}`);
    
    // IMMEDIATE BLOCK for known abuser (only for mini-app users)
    if (claimSource !== 'web' && (fid === 521172 || username === 'nancheng' || address === '0x52d24FEcCb7C546ABaE9e89629c9b417e48FaBD2')) {
      console.log(`🚫 BLOCKED ABUSER: IP=${clientIP}, FID=${fid}, username=${username}, address=${address}`);
      return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403 });
    }
    

    
    if (!auctionId || !winningUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    // For web users, address is required; for mini-app users, FID is required
    if (claimSource === 'web') {
      if (!address) {
        return NextResponse.json({ 
          success: false, 
          error: 'Missing required parameter: address' 
        }, { status: 400 });
      }
    } else {
      if (!fid) {
        return NextResponse.json({ 
          success: false, 
          error: 'Missing required parameter: fid' 
        }, { status: 400 });
      }
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
        .eq('claim_source', claimSource || 'mini_app')
        .single();
      
      if (claimCheckError && claimCheckError.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('Error checking existing claim:', claimCheckError);
        return NextResponse.json({ 
          success: false, 
          error: 'Error checking existing claims' 
        }, { status: 500 });
      }
      
      if (existingClaim) {
        console.log(`Address ${address} has already claimed for auction ${auctionId} (${claimSource}) at ${existingClaim.link_visited_at}`);
        return NextResponse.json({ 
          success: false, 
          error: `This wallet address has already claimed for auction ${auctionId}`,
          existing_claim_time: existingClaim.link_visited_at
        }, { status: 400 });
      }
    }
    
    // Check if this username has already claimed for this specific auction (only for mini-app)
    if (username && claimSource !== 'web') {
      const { data: existingUsernameClaim, error: usernameCheckError } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('username', username)
        .eq('auction_id', auctionId)
        .eq('claim_source', 'mini_app')
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
    const insertData = {
      fid: claimSource === 'web' ? -1 : (fid || null), // Use -1 for web users
      auction_id: auctionId,
      winning_url: winningUrl,
      link_visited_at: new Date().toISOString(),
      eth_address: address || null,
      username: claimSource === 'web' ? 'qrcoinweb' : (username || null),
      claim_source: claimSource || 'mini_app'
    };

    // For web users, try to upsert based on eth_address + auction_id + claim_source
    // For mini-app users, try to upsert based on fid + auction_id + claim_source
    let upsertStrategy;
    if (claimSource === 'web') {
      upsertStrategy = { onConflict: 'eth_address,auction_id,claim_source' };
    } else if (fid) {
      upsertStrategy = { onConflict: 'fid,auction_id,claim_source' };
    } else {
      // If no clear unique constraint, do a regular insert
      upsertStrategy = {};
    }

    const { error } = await supabase
      .from('link_visit_claims')
      .upsert(insertData, upsertStrategy);
    
    if (error) {
      console.error('Error recording link click:', error);
      
      // Check if this is a unique constraint violation
      if (error.code === '23505') {
        if (claimSource === 'web' && error.message?.includes('idx_web_claims_unique')) {
          console.log(`Database constraint prevented duplicate web claim for address ${address} on auction ${auctionId}`);
          return NextResponse.json({ 
            success: false, 
            error: `This wallet address has already claimed for auction ${auctionId}`,
            details: 'Duplicate web claim prevented by database constraint'
          }, { status: 400 });
        } else if (claimSource !== 'web' && error.message?.includes('idx_miniapp_claims_unique')) {
          console.log(`Database constraint prevented duplicate mini-app claim for FID ${fid} on auction ${auctionId}`);
          return NextResponse.json({ 
            success: false, 
            error: `This Farcaster account has already claimed for auction ${auctionId}`,
            details: 'Duplicate mini-app claim prevented by database constraint'
          }, { status: 400 });
        }
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Database error' 
      }, { status: 500 });
    }
    
    const contextLabel = claimSource === 'web' ? 'web' : 'mini-app';
    const userIdentifier = claimSource === 'web' ? address : (username || fid || 'anonymous');
    console.log(`✅ RECORDED CLICK: IP=${clientIP}, user=${userIdentifier}, auction=${auctionId}, context=${contextLabel}`);
    
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