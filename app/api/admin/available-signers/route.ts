import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface Signer {
  fid: number;
  signer_uuid: string;
  permissions: string[];
  status: string;
  follower_count?: number;
}

interface BatchState {
  castHash: string;
  actionType: string;
  targetFid?: number;
  signers: Signer[];
  currentIndex: number;
  results: {
    successful: number;
    failed: number;
    errors: string[];
    details: Array<{
      fid: number;
      action: string;
      success: boolean;
      error?: string;
    }>;
  };
}

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

import { isAdminAddress } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const address = authHeader?.replace('Bearer ', '');
    
    if (!address || !isAdminAddress(address)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch all approved signers with updated metrics
    const { data: signers, error } = await supabase
      .from('neynar_signers_updated')
      .select(`
        fid, 
        permissions, 
        status, 
        approved_at, 
        username,
        display_name,
        follower_count,
        following_count,
        neynar_score,
        power_badge,
        pfp_url,
        bio,
        verified_accounts,
        last_updated_at
      `)
      .eq('status', 'approved')
      .limit(10000)
      .order('follower_count', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching signers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch signers' },
        { status: 500 }
      );
    }

    // Check for any active batch operations
    const batchKeys = await redis.keys('likes-recasts-batch:*');
    const activeBatches: BatchState[] = [];
    const cronKeys: {
      key: string;
      total: number;
      completed: number;
      successful: number;
      failed: number;
    }[] = [];
    
    for (const key of batchKeys) {
      const batchData = await redis.get<BatchState>(key);
      if (batchData) {
        activeBatches.push(batchData);
        cronKeys.push({
          key: key,
          total: batchData.signers.length,
          completed: batchData.currentIndex,
          successful: batchData.results.successful,
          failed: batchData.results.failed,
        });
      }
    }

    return NextResponse.json({
      success: true,
      signers: signers || [],
      count: signers?.length || 0,
      activeBatches: activeBatches.length > 0 ? activeBatches : undefined,
      cronKeys
    });

  } catch (error) {
    console.error('Error in available-signers API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 