/* eslint-disable */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedKey } from '@/utils/getSignedKey';
import { getNeynarClient } from '@/lib/neynar';
import { queueFailedClaim } from '@/lib/queue/failedClaims';
import { validateMiniAppUser } from '@/utils/miniapp-validation';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';

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

// Function to log errors to the database
async function logFailedTransaction(params: {
  fid: number | string;
  eth_address: string;
  username?: string | null;
  option_type: string;
  error_message: string;
  error_code?: string;
  signer_uuid?: string;
  request_data?: Record<string, unknown>;
  retry_count?: number;
}) {
  try {
    // Insert the failure record and get its ID
    const { data, error } = await supabase
      .from('likes_recasts_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        username: params.username || null,
        option_type: params.option_type,
        error_message: params.error_message,
        error_code: params.error_code || null,
        signer_uuid: params.signer_uuid || null,
        request_data: params.request_data ? JSON.stringify(params.request_data) : null,
        retry_count: params.retry_count || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log error to database:', error);
      return;
    }
    
    // Queue for retry if eligible (skip duplicates and validation errors)
    const nonRetryableErrors = [
      'DUPLICATE_CLAIM',
      'DUPLICATE_CLAIM_FID', 
      'DUPLICATE_CLAIM_ADDRESS',
      'DUPLICATE_CLAIM_SPECIFIC',
      'SIGNER_ALREADY_EXISTS',
      'INVALID_USER',
      'VALIDATION_ERROR',
      'ADDRESS_NOT_VERIFIED'
    ];
    
    if (!nonRetryableErrors.includes(params.error_code || '')) {
      await queueFailedClaim({
        id: data.id,
        fid: params.fid as number,
        eth_address: params.eth_address,
        username: params.username as string | null,
        option_type: params.option_type,
        signer_uuid: params.signer_uuid,
      });
    }
  } catch (logError) {
    console.error('Error while logging to failure table:', logError);
  }
}

export async function POST(request: NextRequest) {
  // ENDPOINT DISABLED - Return early with disabled message
  return NextResponse.json({ 
    success: false, 
    error: 'Likes/recasts claims are currently disabled' 
  }, { status: 503 });

  /* eslint-disable */
  // @ts-ignore
  // All code below this point is unreachable due to early return

  /*
  // Get client IP for logging
  const clientIP = getClientIP(request);

  // Rate limiting FIRST: 5 requests per minute per IP (before any processing)
  if (isRateLimited(clientIP, 5, 60000)) {
    console.log(`🚫 RATE LIMITED: IP=${clientIP} (too many likes/recasts claim requests)`);
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }

  try {
    // Validate API key first
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.LINK_CLICK_API_KEY;
    
    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
      console.error(`🚨 UNAUTHORIZED ACCESS from IP: ${clientIP}`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body - handle both old and new format
    const { fid, address, username, likesOnly, optionType: providedOptionType } = await request.json();
    
    if (!fid || !address) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    // Handle backward compatibility
    const optionType = providedOptionType || (likesOnly ? 'likes' : 'both');
    const airdropAmount = optionType === 'likes' ? 1000 : optionType === 'recasts' ? 1000 : 2000;
    
    console.log(`🎯 LIKES/RECASTS CLAIM: IP=${clientIP}, FID=${fid}, address=${address}, username=${username || 'unknown'}, option=${optionType}`);
    
    // Validate Mini App user and verify wallet address
    const userValidation = await validateMiniAppUser(fid, username, address);
    if (!userValidation.isValid) {
      console.log(`User validation failed for FID ${fid}: ${userValidation.error}`);
      
      // Don't queue failed transactions for validation errors - just return error
      return NextResponse.json({ 
        success: false, 
        error: userValidation.error || 'Invalid user or spoofed request' 
      }, { status: 400 });
    }
    
    // COMPREHENSIVE DUPLICATE CLAIM CHECKING
    // Check 1: Has this address already claimed ANY option type?
    const { data: claimDataByAddress, error: selectErrorByAddress } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('eth_address', address)
      .eq('success', true);
      
    if (selectErrorByAddress && selectErrorByAddress.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by address:', selectErrorByAddress);
      
      // Log database error
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: optionType,
          error_message: 'Database error when checking claim status by address',
          error_code: selectErrorByAddress?.code || 'DB_SELECT_ERROR',
          request_data: {
            fid,
            address,
            username,
            likesOnly,
            optionType
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log database error:', logError);
      }
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this address has already claimed any option
    if (claimDataByAddress && claimDataByAddress.length > 0) {
      const existingClaim = claimDataByAddress[0];
      console.log(`Address ${address} has already claimed ${existingClaim.option_type} option at tx ${existingClaim.tx_hash} by FID ${existingClaim.fid}`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: optionType,
          error_message: `Address has already claimed ${existingClaim.option_type} option (previously claimed by FID ${existingClaim.fid})`,
          error_code: 'DUPLICATE_CLAIM_ADDRESS',
          request_data: {
            fid,
            address,
            username,
            likesOnly,
            optionType
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'This wallet address has already claimed likes/recasts rewards',
        tx_hash: existingClaim.tx_hash
      }, { status: 400 });
    }

    // Check 2: Has this FID already claimed ANY option type (with any address)?
    const { data: claimDataByFid, error: selectErrorByFid } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('fid', fid)
      .eq('success', true);
      
    if (selectErrorByFid && selectErrorByFid.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by FID:', selectErrorByFid);
      
      // Log database error
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: optionType,
          error_message: 'Database error when checking claim status by FID',
          error_code: selectErrorByFid?.code || 'DB_SELECT_ERROR',
          request_data: {
            fid,
            address,
            username,
            likesOnly,
            optionType
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log database error:', logError);
      }
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this FID has already claimed any option with any address
    if (claimDataByFid && claimDataByFid.length > 0) {
      const existingClaim = claimDataByFid[0];
      console.log(`FID ${fid} has already claimed ${existingClaim.option_type} option at tx ${existingClaim.tx_hash} with address ${existingClaim.eth_address}`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: optionType,
          error_message: `FID has already claimed ${existingClaim.option_type} option with address ${existingClaim.eth_address}`,
          error_code: 'DUPLICATE_CLAIM_FID',
          request_data: {
            fid,
            address,
            username,
            likesOnly,
            optionType
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'This Farcaster account has already claimed likes/recasts rewards',
        tx_hash: existingClaim.tx_hash
      }, { status: 400 });
    }

    // Check 3: Specific option type check (for backward compatibility, though now redundant)
    const { data: existingSpecificClaim } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('fid', fid)
      .eq('option_type', optionType)
      .eq('success', true)
      .single();
      
    if (existingSpecificClaim) {
      console.log(`User ${fid} has already claimed ${optionType} specifically`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: optionType,
          error_message: `User has already claimed ${optionType} option`,
          error_code: 'DUPLICATE_CLAIM_SPECIFIC',
          request_data: {
            fid,
            address,
            username,
            likesOnly,
            optionType
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
    
      return NextResponse.json({ 
        success: false, 
        error: `User has already claimed ${optionType} option`,
        tx_hash: existingSpecificClaim.tx_hash
      }, { status: 400 });
    }
    
    // Check if user already has a signer
    const { data: existingSigner } = await supabase
      .from('neynar_signers_updated')
      .select('*')
      .eq('fid', fid)
      .single();
    
    if (existingSigner && existingSigner.status === 'approved') {
      console.log(`Using existing approved Neynar signer for FID ${fid}`);
      
              // Update permissions if needed
        const newPermissions = optionType === 'likes' ? ['like'] : 
                              optionType === 'recasts' ? ['recast'] : 
                              ['like', 'recast'];
                              
        const needsUpdate = !newPermissions.every(perm => existingSigner.permissions.includes(perm));
        
        if (needsUpdate) {
          await supabase
            .from('neynar_signers_updated')
            .update({
              permissions: newPermissions,
              updated_at: new Date().toISOString(),
            })
            .eq('fid', fid);
        }
      
      // Return success - no signer approval needed since already approved
      return NextResponse.json({
        success: true,
        message: 'Signer already approved, ready to claim',
        signer_approval_needed: false,
        signer_uuid: existingSigner.signer_uuid,
        amount: airdropAmount,
        option_type: optionType
      });
      
    } else if (existingSigner && existingSigner.status === 'pending_approval') {
      // Signer exists but needs approval - return the existing approval flow
      console.log(`Signer exists but needs approval for FID ${fid}`);
      console.log('Existing signer data:', JSON.stringify({
        signer_uuid: existingSigner.signer_uuid,
        status: existingSigner.status,
        has_approval_url: !!existingSigner.signer_approval_url,
        approval_url: existingSigner.signer_approval_url
      }));
      
      // If we don't have an approval URL, we need to get it from Neynar
      let approvalUrl = existingSigner.signer_approval_url;
      if (!approvalUrl) {
        console.log('No approval URL found, fetching from Neynar...');
        try {
          const neynarClient = getNeynarClient();
          const signerDetails = await neynarClient.lookupSigner({ 
            signerUuid: existingSigner.signer_uuid 
          });
          approvalUrl = signerDetails.signer_approval_url;
          
          // Update the database with the approval URL
          if (approvalUrl) {
            await supabase
              .from('neynar_signers_updated')
              .update({ signer_approval_url: approvalUrl })
              .eq('signer_uuid', existingSigner.signer_uuid);
          }
        } catch (error) {
          console.error('Error fetching signer details from Neynar:', error);
        }
      }
      
      return NextResponse.json({
        success: true,
        message: 'Signer approval required',
        signer_approval_needed: true,
        signer_approval_url: approvalUrl,
        signer_uuid: existingSigner.signer_uuid,
        amount: airdropAmount,
        option_type: optionType
      });
    } else {
      // Create new signer
      try {
        console.log(`Creating new Neynar managed signer for FID ${fid}`);
        const signedKey = await getSignedKey(true); // Use sponsorship
        
        console.log('getSignedKey result:', JSON.stringify({
          signer_uuid: signedKey.signer_uuid,
          status: signedKey.status,
          has_approval_url: !!signedKey.signer_approval_url,
          approval_url_preview: signedKey.signer_approval_url ? signedKey.signer_approval_url.substring(0, 100) + '...' : 'none'
        }));
        
        // Store signer data
        const { error: insertError } = await supabase
          .from('neynar_signers_updated')
          .insert({
            fid: fid,
            signer_uuid: signedKey.signer_uuid,
            public_key: signedKey.public_key,
            status: signedKey.status,
            signer_approval_url: signedKey.signer_approval_url,
            permissions: optionType === 'likes' ? ['like'] : 
                        optionType === 'recasts' ? ['recast'] : 
                        ['like', 'recast'],
            username: username,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          
        if (insertError) {
          console.error('Error storing signer data:', insertError);
        }
        
        // Return approval URL without doing airdrop yet
        return NextResponse.json({
          success: true,
          message: 'Signer approval required',
          signer_approval_needed: true,
          signer_approval_url: signedKey.signer_approval_url,
          signer_uuid: signedKey.signer_uuid,
          amount: airdropAmount,
          option_type: optionType
        });
        
      } catch (signerError) {
        console.error('Error setting up Neynar signer:', signerError);
        
        // Log the failure to the database
        try {
          await logFailedTransaction({
            fid: fid,
            eth_address: address,
            username: username || null,
            option_type: optionType,
            error_message: signerError instanceof Error ? signerError.message : 'Failed to create signer',
            error_code: 'SIGNER_CREATION_ERROR',
            request_data: {
              fid,
              address,
              username,
              likesOnly,
              optionType
            },
            retry_count: 0,
          });
        } catch (logError) {
          console.error('Failed to log signer creation failure:', logError);
        }
        
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to create signer'
        }, { status: 500 });
      }
    }
    
  } catch (error: unknown) {
    console.error('Likes/recasts claim error:', error);
    
    let errorMessage = 'Failed to process claim';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
  */
} 