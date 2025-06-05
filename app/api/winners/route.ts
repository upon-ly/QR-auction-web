import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

// Admin addresses for authorization
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

export async function GET() {
  try {
    // Get recent winners for debugging
    const { data, error } = await supabaseAdmin
      .from('winners')
      .select('*')
      .order('token_id', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: data || [] 
    });

  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      adminAddress,
      token_id,
      winner_address,
      amount,
      url,
      display_name,
      farcaster_username,
      twitter_username,
      basename,
      usd_value,
      is_v1_auction,
      ens_name,
      pfp_url
    } = body;

    // Verify admin authorization
    if (!adminAddress || !ADMIN_ADDRESSES.includes(adminAddress.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!token_id || !winner_address || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: token_id, winner_address, amount' },
        { status: 400 }
      );
    }

    // Insert into Supabase winners table using service role
    const { data, error } = await supabaseAdmin
      .from('winners')
      .upsert({
        token_id: token_id.toString(),
        winner_address: winner_address.toLowerCase(), // Normalize address
        amount: amount.toString(),
        url: url || null,
        display_name: display_name || null,
        farcaster_username: farcaster_username || null,
        twitter_username: twitter_username || null,
        basename: basename || null,
        usd_value: usd_value || null,
        is_v1_auction: is_v1_auction || false, // Default to false instead of null
        ens_name: ens_name || null,
        pfp_url: pfp_url || null
      }, { 
        onConflict: 'token_id' 
      })
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: data?.[0] 
    });

  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 