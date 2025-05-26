import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database reads may fail due to RLS');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json(
        { success: false, error: 'FID is required' },
        { status: 400 }
      );
    }

    // Get user's signer permissions
    const { data: signerData, error } = await supabase
      .from('neynar_signers')
      .select('permissions, username, status')
      .eq('fid', parseInt(fid))
      .eq('status', 'approved')
      .single();

    if (error || !signerData) {
      return NextResponse.json(
        { success: false, error: 'No approved signer found for this user' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      permissions: signerData.permissions || [],
      username: signerData.username,
      status: signerData.status
    });

  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 