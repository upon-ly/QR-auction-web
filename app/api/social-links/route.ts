import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/auth';

// Use admin client for privileged operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch current social links
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('current_campaign_social_links')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching social links:', error);
      return NextResponse.json({ error: 'Failed to fetch social links' }, { status: 500 });
    }

    // Transform database field names to expected camelCase format
    return NextResponse.json({
      quoteTweetUrl: data?.quote_tweet_url || null,
      quoteCastUrl: data?.quote_cast_url || null,
      updatedAt: data?.updated_at || null,
      updatedBy: data?.updated_by || null
    });
  } catch (error) {
    console.error('Social links GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update social links (admin only)
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication using Privy JWT
    const authHeader = request.headers.get('authorization');
    const authResult = await verifyAdminAuth(authHeader);
    
    if (!authResult.isValid) {
      return NextResponse.json({ 
        error: authResult.error || 'Authentication required' 
      }, { status: 401 });
    }

    const { quoteTweetUrl, quoteCastUrl } = await request.json();

    // Validate URLs
    if (quoteTweetUrl && !quoteTweetUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'Tweet URL must be a valid HTTPS URL' }, { status: 400 });
    }

    if (quoteCastUrl && !quoteCastUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'Cast URL must be a valid HTTPS URL' }, { status: 400 });
    }

    // Update or insert social links
    const { data, error } = await supabaseAdmin
      .from('current_campaign_social_links')
      .upsert({
        id: 1, // Single row for global config
        quote_tweet_url: quoteTweetUrl,
        quote_cast_url: quoteCastUrl,
        updated_at: new Date().toISOString(),
        updated_by: authResult.userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating social links:', error);
      return NextResponse.json({ error: 'Failed to update social links' }, { status: 500 });
    }

    // Transform response to expected camelCase format
    return NextResponse.json({
      quoteTweetUrl: data?.quote_tweet_url || null,
      quoteCastUrl: data?.quote_cast_url || null,
      updatedAt: data?.updated_at || null,
      updatedBy: data?.updated_by || null
    });
  } catch (error) {
    console.error('Social links POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 