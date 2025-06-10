import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

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
    if (!ADMIN_ADDRESSES.includes(address)) {
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