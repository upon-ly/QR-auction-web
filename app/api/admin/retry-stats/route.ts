import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

// Setup clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// List of admin addresses
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
    
    // Get counts of failures
    const { count: failureCount } = await supabase
      .from('link_visit_claim_failures')
      .select('*', { count: 'exact', head: true });
    
    // Get all retry keys from Redis
    const keys = await redis.keys('claim:*');
    
    // Initialize stats object
    const stats = {
      total: keys.length,
      byStatus: {
        queued: 0,
        processing: 0,
        retry_scheduled: 0,
        success: 0,
        failed: 0,
        already_claimed: 0,
        max_retries_exceeded: 0
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
        if (result && typeof result === 'object' && 'status' in result) {
          const status = result.status as string;
          stats.byStatus[status as keyof typeof stats.byStatus] = 
            (stats.byStatus[status as keyof typeof stats.byStatus] || 0) + 1;
        }
      }
    }
    
    // Get recent failures
    const { data: recentFailures } = await supabase
      .from('link_visit_claim_failures')
      .select('id, fid, eth_address, auction_id, error_code, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Get recent claims
    const { data: recentClaims } = await supabase
      .from('link_visit_claims')
      .select('fid, eth_address, auction_id, claimed_at, tx_hash')
      .eq('success', true)
      .order('claimed_at', { ascending: false })
      .limit(10);
    
    return NextResponse.json({
      failureCount,
      retryStats: stats,
      recentFailures,
      recentClaims
    });
  } catch (error) {
    console.error('Error fetching retry stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 