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

// Type for signer data
interface Signer {
  fid: number;
  signer_uuid: string;
  permissions: string[];
  status: string;
}

// Type for results tracking
interface Results {
  successful: number;
  failed: number;
  total: number;
  errors: string[];
  details: Array<{
    fid: number;
    action: string;
    success: boolean;
    error?: string;
  }>;
}

// Neynar API response types
interface NeynarUser {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  custody_address?: string;
  follower_count?: number;
  following_count?: number;
  power_badge?: boolean;
  verified_accounts?: Array<{
    platform: "x" | "github";
    username: string;
  }>;
  experimental?: {
    neynar_user_score?: number;
  };
  score?: number;
}

interface NeynarReaction {
  reaction_type: 'like' | 'recast';
  user: NeynarUser;
}

interface NeynarReactionsResponse {
  reactions: NeynarReaction[];
  next?: {
    cursor: string;
  };
}

// Rate limiting removed for admin operations since access is already restricted to authorized addresses

// Helper function to process a like with retry logic
async function processLikeWithRetry(signer: Signer, castHash: string, results: Results, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        
        // If it's a rate limit error, wait and retry
        if (likeResponse.status === 429 && attempt < maxRetries) {
          console.log(`Rate limited for FID ${signer.fid}, waiting 2s before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        console.error(`Failed to like for FID ${signer.fid} (attempt ${attempt}):`, error);
        results.errors.push(`Like failed for FID ${signer.fid}: ${error.message || 'Unknown error'}`);
        results.details.push({
          fid: signer.fid,
          action: 'like',
          success: false,
          error: error.message || 'Unknown error'
        });
        results.failed++;
        return;
      } else {
        console.log(`Successfully liked cast for FID ${signer.fid} (attempt ${attempt})`);
        results.details.push({
          fid: signer.fid,
          action: 'like',
          success: true
        });
        results.successful++;
        return;
      }
    } catch (likeError) {
      if (attempt === maxRetries) {
        console.error(`Error liking for FID ${signer.fid} after ${maxRetries} attempts:`, likeError);
        results.errors.push(`Like error for FID ${signer.fid}: ${likeError}`);
        results.details.push({
          fid: signer.fid,
          action: 'like',
          success: false,
          error: String(likeError)
        });
        results.failed++;
      } else {
        console.log(`Retrying like for FID ${signer.fid} (attempt ${attempt + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

// Helper function to process a recast with retry logic
async function processRecastWithRetry(signer: Signer, castHash: string, results: Results, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        
        // If it's a rate limit error, wait and retry
        if (recastResponse.status === 429 && attempt < maxRetries) {
          console.log(`Rate limited for FID ${signer.fid}, waiting 2s before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        console.error(`Failed to recast for FID ${signer.fid} (attempt ${attempt}):`, error);
        results.errors.push(`Recast failed for FID ${signer.fid}: ${error.message || 'Unknown error'}`);
        results.details.push({
          fid: signer.fid,
          action: 'recast',
          success: false,
          error: error.message || 'Unknown error'
        });
        results.failed++;
        return;
      } else {
        console.log(`Successfully recasted for FID ${signer.fid} (attempt ${attempt})`);
        results.details.push({
          fid: signer.fid,
          action: 'recast',
          success: true
        });
        results.successful++;
        return;
      }
    } catch (recastError) {
      if (attempt === maxRetries) {
        console.error(`Error recasting for FID ${signer.fid} after ${maxRetries} attempts:`, recastError);
        results.errors.push(`Recast error for FID ${signer.fid}: ${recastError}`);
        results.details.push({
          fid: signer.fid,
          action: 'recast',
          success: false,
          error: String(recastError)
        });
        results.failed++;
      } else {
        console.log(`Retrying recast for FID ${signer.fid} (attempt ${attempt + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

// Batch processing function
async function processBatch<T>(items: T[], batchSize: number, processor: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));
    
    // Add delay between batches to avoid overwhelming the API
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

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

    // Rate limiting removed for admin operations

    const { castHash, fids, actionType, targetFid, numLikes, numRecasts } = await request.json();
    
    // New validation for selective likes/recasts
    if (numLikes !== undefined || numRecasts !== undefined) {
      if (!castHash) {
        return NextResponse.json(
          { error: 'Cast hash is required for likes/recasts actions' },
          { status: 400 }
        );
      }
      
      if (numLikes !== undefined && (typeof numLikes !== 'number' || numLikes < 0)) {
        return NextResponse.json(
          { error: 'numLikes must be a non-negative number' },
          { status: 400 }
        );
      }
      
      if (numRecasts !== undefined && (typeof numRecasts !== 'number' || numRecasts < 0)) {
        return NextResponse.json(
          { error: 'numRecasts must be a non-negative number' },
          { status: 400 }
        );
      }
    } else {
      // Legacy validation for old API usage
      if (!fids || !actionType) {
        return NextResponse.json(
          { error: 'Missing required parameters: fids, actionType OR numLikes/numRecasts' },
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
    }

    // Handle both new selective mode and legacy mode
    let allSigners = [];
    
    if (numLikes !== undefined || numRecasts !== undefined) {
      console.log(`Selective engagement: ${numLikes || 0} likes, ${numRecasts || 0} recasts for cast ${castHash}`);
      
      // Get all approved signers for selective mode
      const { data: signers, error } = await supabase
        .from('neynar_signers')
        .select('fid, signer_uuid, permissions, status')
        .eq('status', 'approved')
        .limit(10000);

      if (error) {
        console.error('Error fetching signers:', error);
        return NextResponse.json(
          { error: `Failed to fetch signers: ${error.message}` },
          { status: 500 }
        );
      }

      allSigners = signers || [];
    } else {
      console.log(`Testing likes/recasts/follows for cast ${castHash} with ${fids.length} users, action: ${actionType}`);

      // Batch FIDs to avoid URI too large error (Supabase limit)
      const BATCH_SIZE = 100; // Adjust this if needed
      
      for (let i = 0; i < fids.length; i += BATCH_SIZE) {
        const fidBatch = fids.slice(i, i + BATCH_SIZE);
        console.log(`Fetching signers batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(fids.length / BATCH_SIZE)} (${fidBatch.length} FIDs)`);
        
        const { data: batchSigners, error: batchError } = await supabase
          .from('neynar_signers')
          .select('fid, signer_uuid, permissions, status')
          .eq('status', 'approved')
          .in('fid', fidBatch);

        if (batchError) {
          console.error(`Error fetching signers batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);
          return NextResponse.json(
            { error: `Failed to fetch signers batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}` },
            { status: 500 }
          );
        }

        if (batchSigners && batchSigners.length > 0) {
          allSigners.push(...batchSigners);
        }
      }
    }

    if (allSigners.length === 0) {
      return NextResponse.json(
        { error: 'No approved signers found for the specified FIDs' },
        { status: 404 }
      );
    }

    console.log(`Found ${allSigners.length} approved signers to process`);

    // For selective mode, randomly pick signers for likes and recasts
    let likersToProcess: Signer[] = [];
    let recastersToProcess: Signer[] = [];
    
    if (numLikes !== undefined || numRecasts !== undefined) {
      // Filter signers by permissions first
      const likersPool = allSigners.filter(s => s.permissions.includes('like'));
      const recastersPool = allSigners.filter(s => s.permissions.includes('recast'));
      
      // Randomly select for likes
      if (numLikes && numLikes > 0) {
        const shuffledLikers = [...likersPool].sort(() => Math.random() - 0.5);
        likersToProcess = shuffledLikers.slice(0, Math.min(numLikes, shuffledLikers.length));
        console.log(`Selected ${likersToProcess.length} signers for likes (requested: ${numLikes}, available: ${likersPool.length})`);
      }
      
      // Randomly select for recasts
      if (numRecasts && numRecasts > 0) {
        const shuffledRecasters = [...recastersPool].sort(() => Math.random() - 0.5);
        recastersToProcess = shuffledRecasters.slice(0, Math.min(numRecasts, shuffledRecasters.length));
        console.log(`Selected ${recastersToProcess.length} signers for recasts (requested: ${numRecasts}, available: ${recastersPool.length})`);
      }
    }

    // Process each signer
    const results = {
      successful: 0,
      failed: 0,
      total: numLikes !== undefined || numRecasts !== undefined ? 
        (likersToProcess.length + recastersToProcess.length) : allSigners.length,
      errors: [] as string[],
      details: [] as Array<{
        fid: number;
        action: string;
        success: boolean;
        error?: string;
      }>
    };

    // For selective mode, process likes and recasts separately
    if (numLikes !== undefined || numRecasts !== undefined) {
      // Get existing reactions to avoid duplicates
      console.log('Fetching existing reactions to avoid duplicates...');
      const existingLikes = new Set<number>();
      const existingRecasts = new Set<number>();
      
      try {
        // Fetch ALL existing likes with pagination
        let likesCursor: string | null = null;
        let totalLikesPages = 0;
        do {
          const likesUrl: string = `${NEYNAR_API_URL}/farcaster/reactions/cast?hash=${castHash}&types=likes&limit=100${likesCursor ? `&cursor=${likesCursor}` : ''}`;
          const likesResponse: Response = await fetch(likesUrl, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          
          if (likesResponse.ok) {
            const likesData: NeynarReactionsResponse = await likesResponse.json();
            likesData.reactions?.forEach((reaction: NeynarReaction) => {
              existingLikes.add(reaction.user.fid);
            });
            likesCursor = likesData.next?.cursor || null;
            totalLikesPages++;
          } else {
            break;
          }
        } while (likesCursor);
        
        console.log(`Found ${existingLikes.size} existing likes across ${totalLikesPages} pages`);
        
        // Fetch ALL existing recasts with pagination
        let recastsCursor: string | null = null;
        let totalRecastsPages = 0;
        do {
          const recastsUrl: string = `${NEYNAR_API_URL}/farcaster/reactions/cast?hash=${castHash}&types=recasts&limit=100${recastsCursor ? `&cursor=${recastsCursor}` : ''}`;
          const recastsResponse: Response = await fetch(recastsUrl, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          
          if (recastsResponse.ok) {
            const recastsData: NeynarReactionsResponse = await recastsResponse.json();
            recastsData.reactions?.forEach((reaction: NeynarReaction) => {
              existingRecasts.add(reaction.user.fid);
            });
            recastsCursor = recastsData.next?.cursor || null;
            totalRecastsPages++;
          } else {
            break;
          }
        } while (recastsCursor);
        
        console.log(`Found ${existingRecasts.size} existing recasts across ${totalRecastsPages} pages`);
      } catch (error) {
        console.warn('Failed to fetch existing reactions, proceeding without deduplication:', error);
      }
      
      // Filter out FIDs that already liked/recasted
      const filteredLikers = likersToProcess.filter(signer => !existingLikes.has(signer.fid));
      const filteredRecasters = recastersToProcess.filter(signer => !existingRecasts.has(signer.fid));
      
      console.log(`Filtered likes: ${filteredLikers.length}/${likersToProcess.length} (${likersToProcess.length - filteredLikers.length} already liked)`);
      console.log(`Filtered recasts: ${filteredRecasters.length}/${recastersToProcess.length} (${recastersToProcess.length - filteredRecasters.length} already recasted)`);
      
      // Process likes
      await processBatch(filteredLikers, 10, async (signer) => {
        await processLikeWithRetry(signer, castHash, results);
      });
      
      // Process recasts
      await processBatch(filteredRecasters, 10, async (signer) => {
        await processRecastWithRetry(signer, castHash, results);
      });
      
      // Add skipped reactions to results for transparency
      const skippedLikes = likersToProcess.length - filteredLikers.length;
      const skippedRecasts = recastersToProcess.length - filteredRecasters.length;
      
      if (skippedLikes > 0) {
        results.details.push({
          fid: 0,
          action: 'like',
          success: true,
          error: `Skipped ${skippedLikes} FIDs that already liked this cast`
        });
      }
      
      if (skippedRecasts > 0) {
        results.details.push({
          fid: 0,
          action: 'recast', 
          success: true,
          error: `Skipped ${skippedRecasts} FIDs that already recasted this cast`
        });
      }
    } else {
      // Legacy mode - process all signers with original logic
      for (const signer of allSigners) {
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