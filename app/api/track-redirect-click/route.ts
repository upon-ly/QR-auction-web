import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIP } from '@/lib/ip-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auctionId, clickSource } = body;

    if (!auctionId || !clickSource) {
      return NextResponse.json(
        { error: 'Missing required fields: auctionId, clickSource' },
        { status: 400 }
      );
    }

    // Extract request metadata
    const ipAddress = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';

    // Insert click tracking record
    const { error } = await supabase
      .from('redirect_click_tracking')
      .insert({
        auction_id: auctionId,
        ip_address: ipAddress,
        user_agent: userAgent,
        referrer: referrer,
        click_source: clickSource
      });

    if (error) {
      console.error('Error tracking redirect click:', error);
      return NextResponse.json(
        { error: 'Failed to track click' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in track-redirect-click API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 