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
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database writes may fail due to RLS');
}

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_API_URL = 'https://api.neynar.com/v2';

// This endpoint will be called when a new daily winner is announced
// It will automatically like and/or recast the announcement for all users who have granted permission
export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized (you might want to add API key verification)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }
    
    const { castHash, castUrl } = await request.json();
    
    if (!castHash || !castUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing cast hash or URL' 
      }, { status: 400 });
    }
    
    console.log(`Processing auto-engagement for cast: ${castHash}`);
    
    // Get all approved signers
    const { data: approvedSigners, error: fetchError } = await supabase
      .from('neynar_signers')
      .select('*')
      .eq('status', 'approved');
      
    if (fetchError) {
      console.error('Error fetching approved signers:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch approved signers' 
      }, { status: 500 });
    }
    
    if (!approvedSigners || approvedSigners.length === 0) {
      console.log('No approved signers found');
      return NextResponse.json({ 
        success: true, 
        message: 'No approved signers to process',
        processed: 0
      });
    }
    
    console.log(`Found ${approvedSigners.length} approved signers`);
    
    // Process each signer
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    for (const signer of approvedSigners) {
      try {
        // Check what permissions this signer has
        const hasLikePermission = signer.permissions.includes('like');
        const hasRecastPermission = signer.permissions.includes('recast');
        
        // Like the cast if permission granted
        if (hasLikePermission) {
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
              results.errors.push(`Like failed for FID ${signer.fid}: ${error.message}`);
            } else {
              console.log(`Successfully liked cast for FID ${signer.fid}`);
            }
          } catch (likeError) {
            console.error(`Error liking for FID ${signer.fid}:`, likeError);
            results.errors.push(`Like error for FID ${signer.fid}: ${likeError}`);
          }
        }
        
        // Recast if permission granted
        if (hasRecastPermission) {
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
              results.errors.push(`Recast failed for FID ${signer.fid}: ${error.message}`);
            } else {
              console.log(`Successfully recasted for FID ${signer.fid}`);
            }
          } catch (recastError) {
            console.error(`Error recasting for FID ${signer.fid}:`, recastError);
            results.errors.push(`Recast error for FID ${signer.fid}: ${recastError}`);
          }
        }
        
        results.successful++;
        
      } catch (signerError) {
        console.error(`Error processing signer FID ${signer.fid}:`, signerError);
        results.failed++;
        results.errors.push(`Processing error for FID ${signer.fid}: ${signerError}`);
      }
    }
    
    // Log the engagement activity
    const { error: logError } = await supabase
      .from('auto_engagement_logs')
      .insert({
        cast_hash: castHash,
        cast_url: castUrl,
        total_signers: approvedSigners.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : null,
        processed_at: new Date().toISOString(),
      });
      
    if (logError) {
      console.error('Error logging engagement activity:', logError);
    }
    
    console.log(`Auto-engagement complete. Successful: ${results.successful}, Failed: ${results.failed}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Auto-engagement processed',
      results: {
        total: approvedSigners.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
      }
    });
    
  } catch (error: unknown) {
    console.error('Auto-engagement error:', error);
    
    let errorMessage = 'Failed to process auto-engagement';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 