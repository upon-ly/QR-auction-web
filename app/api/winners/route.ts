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

    console.log(`[WinnerAPI] Adding auction #${token_id} winner to database`);

    // Insert into Supabase winners table using service role
    const { data, error } = await supabaseAdmin
      .from('winners')
      .upsert({
        token_id: token_id.toString(),
        winner_address,
        amount: amount.toString(),
        url: url || null,
        display_name: display_name || null,
        farcaster_username: farcaster_username || null,
        basename: basename || null,
        usd_value: usd_value || null,
        is_v1_auction: is_v1_auction || null,
        ens_name: ens_name || null,
        pfp_url: pfp_url || null
      }, { 
        onConflict: 'token_id' 
      })
      .select();

    if (error) {
      console.error('[WinnerAPI] Error inserting winner:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[WinnerAPI] Successfully added winner to database');
    return NextResponse.json({ 
      success: true, 
      data: data?.[0] 
    });

  } catch (error) {
    console.error('[WinnerAPI] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 