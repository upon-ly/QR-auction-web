import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

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

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// List of admin addresses from app/admin/page.tsx
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
].map(addr => addr.toLowerCase());

export async function GET(request: NextRequest) {
  try {
    // Get user address from query params
    const searchParams = request.nextUrl.searchParams;
    const userAddress = searchParams.get('address')?.toLowerCase();
    
    // Enforce authentication
    if (!userAddress || !ADMIN_ADDRESSES.includes(userAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get failure counts for all claim types
    const { count: linkVisitFailureCount } = await supabase
      .from('link_visit_claim_failures')
      .select('*', { count: 'exact', head: true });
      
    const { count: airdropFailureCount } = await supabase
      .from('airdrop_claim_failures')
      .select('*', { count: 'exact', head: true });
      
    const { count: likesRecastsFailureCount } = await supabase
      .from('likes_recasts_claim_failures')
      .select('*', { count: 'exact', head: true });
    
    // Get all retry keys from Redis
    const keys = await redis.keys('claim:*');
    
    // Initialize stats object
    const stats = {
      total: keys.length,
      byType: {
        'link-visit': 0,
        'airdrop': 0,
        'likes-recasts': 0,
        'unknown': 0
      },
      byStatus: {
        queued: 0,
        processing: 0,
        retry_scheduled: 0,
        success: 0,
        failed: 0,
        already_claimed: 0,
        max_retries_exceeded: 0,
        tx_success_db_fail: 0
      }
    };
    
    // Get status for each claim if there are any keys
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.hgetall(key);
      }
      const results = await pipeline.exec();
      
      for (const result of results) {
        if (result && typeof result === 'object') {
          // Count by type
          if ('type' in result) {
            const type = result.type as string;
            stats.byType[type as keyof typeof stats.byType] = 
              (stats.byType[type as keyof typeof stats.byType] || 0) + 1;
          } else {
            stats.byType.unknown++;
          }
          
          // Count by status
          if ('status' in result) {
            const status = result.status as string;
            stats.byStatus[status as keyof typeof stats.byStatus] = 
              (stats.byStatus[status as keyof typeof stats.byStatus] || 0) + 1;
          }
        }
      }
    }
    
    // Get recent link-visit failures
    const { data: recentLinkVisitFailures } = await supabase
      .from('link_visit_claim_failures')
      .select('id, fid, eth_address, auction_id, error_code, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    // Get recent airdrop failures
    const { data: recentAirdropFailures } = await supabase
      .from('airdrop_claim_failures')
      .select('id, fid, eth_address, error_code, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
      
    // Get recent likes/recasts failures
    const { data: recentLikesRecastsFailures } = await supabase
      .from('likes_recasts_claim_failures')
      .select('id, fid, eth_address, option_type, error_code, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    // Get recent link-visit claims
    const { data: recentLinkVisitClaims } = await supabase
      .from('link_visit_claims')
      .select('fid, eth_address, auction_id, claimed_at, tx_hash')
      .eq('success', true)
      .order('claimed_at', { ascending: false })
      .limit(5);
    
    // Get recent airdrop claims
    const { data: recentAirdropClaims } = await supabase
      .from('airdrop_claims')
      .select('fid, eth_address, claimed_at, tx_hash')
      .eq('success', true)
      .order('claimed_at', { ascending: false })
      .limit(5);
      
    // Get recent likes/recasts claims
    const { data: recentLikesRecastsClaims } = await supabase
      .from('likes_recasts_claims')
      .select('fid, eth_address, option_type, created_at, tx_hash')
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(5);
    
    return NextResponse.json({
      failures: {
        linkVisit: linkVisitFailureCount,
        airdrop: airdropFailureCount,
        likesRecasts: likesRecastsFailureCount,
        total: (linkVisitFailureCount || 0) + (airdropFailureCount || 0) + (likesRecastsFailureCount || 0)
      },
      retryStats: stats,
      recentFailures: {
        linkVisit: recentLinkVisitFailures,
        airdrop: recentAirdropFailures,
        likesRecasts: recentLikesRecastsFailures
      },
      recentClaims: {
        linkVisit: recentLinkVisitClaims, 
        airdrop: recentAirdropClaims,
        likesRecasts: recentLikesRecastsClaims
      }
    });
  } catch (error) {
    console.error('Error fetching retry stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 