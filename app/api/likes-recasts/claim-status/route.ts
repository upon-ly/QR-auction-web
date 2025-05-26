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
    const optionType = searchParams.get('option_type');
    
    if (!fid) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing FID parameter' 
      }, { status: 400 });
    }
    
    // Check if user has already claimed for any option type
    const { data: existingClaims, error } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('fid', fid)
      .eq('success', true);
      
    if (error) {
      console.error('Error checking claim status:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check claim status' 
      }, { status: 500 });
    }
    
    // If optionType is provided, check for that specific type
    if (optionType) {
      const specificClaim = existingClaims?.find(claim => claim.option_type === optionType);
      return NextResponse.json({
        success: true,
        has_claimed: !!specificClaim,
        claim_data: specificClaim || null,
        all_claims: existingClaims || []
      });
    }
    
    // Return all claims for this user
    return NextResponse.json({
      success: true,
      has_claimed: existingClaims && existingClaims.length > 0,
      all_claims: existingClaims || []
    });
    
  } catch (error) {
    console.error('Claim status check error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 