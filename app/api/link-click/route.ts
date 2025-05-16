import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

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
    
    // If no FID (not in a frame context), still record the click but with null FID
    // This handles visitors from outside of frames
    
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