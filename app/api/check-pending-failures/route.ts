import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get('fid');
    const ethAddress = searchParams.get('eth_address');
    const auctionId = searchParams.get('auction_id');
    
    if (!fid) {
      return NextResponse.json({ 
        success: false, 
        error: 'FID is required' 
      }, { status: 400 });
    }

    const fidNumber = parseInt(fid);
    if (isNaN(fidNumber)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid FID' 
      }, { status: 400 });
    }

    // Check for pending failures in all three failure tables
    const checks = [];

    // 1. Check link visit failures (if auction_id provided)
    if (auctionId) {
      checks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id, created_at')
          .eq('fid', fidNumber)
          .eq('auction_id', auctionId)
          .maybeSingle()
      );
    }

    // 2. Check airdrop failures
    checks.push(
      supabase
        .from('airdrop_claim_failures')
        .select('id, created_at')
        .eq('fid', fidNumber)
        .maybeSingle()
    );

    // 3. Check likes/recasts failures
    checks.push(
      supabase
        .from('likes_recasts_claim_failures')
        .select('id, created_at')
        .eq('fid', fidNumber)
        .maybeSingle()
    );

    // Also check by eth_address if provided
    if (ethAddress) {
      if (auctionId) {
        checks.push(
          supabase
            .from('link_visit_claim_failures')
            .select('id, created_at')
            .eq('eth_address', ethAddress)
            .eq('auction_id', auctionId)
            .maybeSingle()
        );
      }

      checks.push(
        supabase
          .from('airdrop_claim_failures')
          .select('id, created_at')
          .eq('eth_address', ethAddress)
          .maybeSingle()
      );

      checks.push(
        supabase
          .from('likes_recasts_claim_failures')
          .select('id, created_at')
          .eq('eth_address', ethAddress)
          .maybeSingle()
      );
    }

    // Execute all checks in parallel
    const results = await Promise.all(checks);
    
    // Check if any failures were found
    const hasPendingFailures = results.some(result => {
      const { data, error } = result;
      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('Error checking failures:', error);
        return false;
      }
      return data !== null;
    });

    // If failures found, get the most recent one for context
    let mostRecentFailure = null;
    if (hasPendingFailures) {
      const failures = results
        .map(result => result.data)
        .filter(data => data !== null)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      mostRecentFailure = failures[0];
    }

    return NextResponse.json({
      success: true,
      hasPendingFailures,
      mostRecentFailure,
      message: hasPendingFailures 
        ? 'User has pending claim failures in retry queue'
        : 'No pending failures found'
    });

  } catch (error) {
    console.error('Error checking pending failures:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 