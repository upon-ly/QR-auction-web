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

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_API_URL = 'https://api.neynar.com/v2';

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const address = authHeader?.replace('Bearer ', '');
    
    if (!address || !ADMIN_ADDRESSES.includes(address.toLowerCase())) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { castHash, fids, actionType, targetFid } = await request.json();
    
    if (!fids || !actionType) {
      return NextResponse.json(
        { error: 'Missing required parameters: fids, actionType' },
        { status: 400 }
      );
    }

    if (!castHash && actionType !== 'follow') {
      return NextResponse.json(
        { error: 'Cast hash is required for likes/recasts actions' },
        { status: 400 }
      );
    }

    if ((actionType === 'follow' || actionType === 'all') && !targetFid) {
      return NextResponse.json(
        { error: 'Target FID is required for follow actions' },
        { status: 400 }
      );
    }

    if (!Array.isArray(fids) || fids.length === 0) {
      return NextResponse.json(
        { error: 'fids must be a non-empty array' },
        { status: 400 }
      );
    }

    console.log(`Testing likes/recasts/follows for cast ${castHash} with ${fids.length} users, action: ${actionType}`);

    // Get signers for the specified FIDs
    const { data: signers, error: signersError } = await supabase
      .from('neynar_signers')
      .select('fid, signer_uuid, permissions, status')
      .eq('status', 'approved')
      .in('fid', fids);

    if (signersError) {
      console.error('Error fetching signers:', signersError);
      return NextResponse.json(
        { error: 'Failed to fetch signers' },
        { status: 500 }
      );
    }

    if (!signers || signers.length === 0) {
      return NextResponse.json(
        { error: 'No approved signers found for the specified FIDs' },
        { status: 404 }
      );
    }

    console.log(`Found ${signers.length} approved signers to process`);

    // Process each signer
    const results = {
      successful: 0,
      failed: 0,
      total: signers.length,
      errors: [] as string[],
      details: [] as Array<{
        fid: number;
        action: string;
        success: boolean;
        error?: string;
      }>
    };

    for (const signer of signers) {
      try {
        // Check what permissions this signer has
        const hasLikePermission = signer.permissions.includes('like');
        const hasRecastPermission = signer.permissions.includes('recast');
        const hasFollowPermission = signer.permissions.includes('follow');
        
        let actionSucceeded = false;

        // Like the cast if permission granted and action requires it
        if (hasLikePermission && (actionType === 'likes' || actionType === 'both' || actionType === 'all')) {
          try {
            const likeResponse = await fetch(`${NEYNAR_API_URL}/farcaster/reaction`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api_key': NEYNAR_API_KEY,
              },
              body: JSON.stringify({
                signer_uuid: signer.signer_uuid,
                reaction_type: 'like',
                target: castHash,
              }),
            });
            
            if (!likeResponse.ok) {
              const error = await likeResponse.json();
              console.error(`Failed to like for FID ${signer.fid}:`, error);
              results.errors.push(`Like failed for FID ${signer.fid}: ${error.message || 'Unknown error'}`);
              results.details.push({
                fid: signer.fid,
                action: 'like',
                success: false,
                error: error.message || 'Unknown error'
              });
            } else {
              console.log(`Successfully liked cast for FID ${signer.fid}`);
              results.details.push({
                fid: signer.fid,
                action: 'like',
                success: true
              });
              actionSucceeded = true;
            }
          } catch (likeError) {
            console.error(`Error liking for FID ${signer.fid}:`, likeError);
            results.errors.push(`Like error for FID ${signer.fid}: ${likeError}`);
            results.details.push({
              fid: signer.fid,
              action: 'like',
              success: false,
              error: String(likeError)
            });
          }
        } else if (actionType === 'likes' || actionType === 'both' || actionType === 'all') {
          results.details.push({
            fid: signer.fid,
            action: 'like',
            success: false,
            error: 'No like permission'
          });
        }
        
        // Recast if permission granted and action type includes recast
        if (hasRecastPermission && (actionType === 'both' || actionType === 'all')) {
          try {
            const recastResponse = await fetch(`${NEYNAR_API_URL}/farcaster/reaction`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api_key': NEYNAR_API_KEY,
              },
              body: JSON.stringify({
                signer_uuid: signer.signer_uuid,
                reaction_type: 'recast',
                target: castHash,
              }),
            });
            
            if (!recastResponse.ok) {
              const error = await recastResponse.json();
              console.error(`Failed to recast for FID ${signer.fid}:`, error);
              results.errors.push(`Recast failed for FID ${signer.fid}: ${error.message || 'Unknown error'}`);
              results.details.push({
                fid: signer.fid,
                action: 'recast',
                success: false,
                error: error.message || 'Unknown error'
              });
            } else {
              console.log(`Successfully recasted for FID ${signer.fid}`);
              results.details.push({
                fid: signer.fid,
                action: 'recast',
                success: true
              });
              actionSucceeded = true;
            }
          } catch (recastError) {
            console.error(`Error recasting for FID ${signer.fid}:`, recastError);
            results.errors.push(`Recast error for FID ${signer.fid}: ${recastError}`);
            results.details.push({
              fid: signer.fid,
              action: 'recast',
              success: false,
              error: String(recastError)
            });
          }
        } else if (actionType === 'both' || actionType === 'all') {
          results.details.push({
            fid: signer.fid,
            action: 'recast',
            success: false,
            error: 'No recast permission'
          });
        }

        // Follow if permission granted and action type includes follow
        if (hasFollowPermission && (actionType === 'follow' || actionType === 'all')) {
          try {
            const followResponse = await fetch(`${NEYNAR_API_URL}/farcaster/user/follow`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api_key': NEYNAR_API_KEY,
              },
              body: JSON.stringify({
                signer_uuid: signer.signer_uuid,
                target_fids: [targetFid],
              }),
            });
            
            if (!followResponse.ok) {
              const error = await followResponse.json();
              console.error(`Failed to follow for FID ${signer.fid}:`, error);
              results.errors.push(`Follow failed for FID ${signer.fid}: ${error.message || 'Unknown error'}`);
              results.details.push({
                fid: signer.fid,
                action: 'follow',
                success: false,
                error: error.message || 'Unknown error'
              });
            } else {
              console.log(`Successfully followed for FID ${signer.fid}`);
              results.details.push({
                fid: signer.fid,
                action: 'follow',
                success: true
              });
              actionSucceeded = true;
            }
          } catch (followError) {
            console.error(`Error following for FID ${signer.fid}:`, followError);
            results.errors.push(`Follow error for FID ${signer.fid}: ${followError}`);
            results.details.push({
              fid: signer.fid,
              action: 'follow',
              success: false,
              error: String(followError)
            });
          }
        } else if (actionType === 'follow' || actionType === 'all') {
          results.details.push({
            fid: signer.fid,
            action: 'follow',
            success: false,
            error: 'No follow permission'
          });
        }
        
        if (actionSucceeded) {
          results.successful++;
        } else {
          results.failed++;
        }
        
      } catch (signerError) {
        console.error(`Error processing signer FID ${signer.fid}:`, signerError);
        results.failed++;
        results.errors.push(`Processing error for FID ${signer.fid}: ${signerError}`);
        results.details.push({
          fid: signer.fid,
          action: 'processing',
          success: false,
          error: String(signerError)
        });
      }
    }

    // Log the test activity
    const { error: logError } = await supabase
      .from('auto_engagement_logs')
      .insert({
        cast_hash: castHash,
        cast_url: `https://warpcast.com/~/conversations/${castHash}`,
        total_signers: results.total,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : null,
        processed_at: new Date().toISOString(),
      });
      
    if (logError) {
      console.error('Error logging test activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Test completed: ${results.successful} successful, ${results.failed} failed`,
      successful: results.successful,
      failed: results.failed,
      total: results.total,
      errors: results.errors,
      details: JSON.stringify(results.details, null, 2)
    });

  } catch (error) {
    console.error('Error in test-likes-recasts API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 