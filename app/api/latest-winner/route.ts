import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { isAdminAddress } from '@/lib/constants';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const address = authHeader.substring(7).toLowerCase();
    if (!isAdminAddress(address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query the latest winner from the winners table
    const { data: latestWinner, error } = await supabase
      .from('winners')
      .select('token_id, farcaster_username, twitter_username, amount, created_at')
      .order('token_id', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch latest winner',
        details: error.message
      }, { status: 500 });
    }

    if (!latestWinner) {
      return NextResponse.json({ 
        error: 'No winners found in database'
      }, { status: 404 });
    }

    // Format the response
    const response = {
      auctionId: latestWinner.token_id,
      farcasterUsername: latestWinner.farcaster_username,
      twitterUsername: latestWinner.twitter_username,
      amount: latestWinner.amount,
      createdAt: latestWinner.created_at
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching latest winner:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 