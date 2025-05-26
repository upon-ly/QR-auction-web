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

export async function POST(request: NextRequest) {
  try {
    const { fid, signerUuid, signature } = await request.json();
    
    if (!fid || !signerUuid) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    console.log(`Approving signer for FID ${fid}, signer UUID: ${signerUuid}`);
    
    // Verify the signer exists in our database
    const { data: signerData, error: fetchError } = await supabase
      .from('neynar_signers')
      .select('*')
      .eq('fid', fid)
      .eq('signer_uuid', signerUuid)
      .single();
      
    if (fetchError || !signerData) {
      console.error('Signer not found in database:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Signer not found' 
      }, { status: 404 });
    }
    
    if (signerData.status === 'approved') {
      console.log('Signer already approved');
      return NextResponse.json({ 
        success: true, 
        message: 'Signer already approved' 
      });
    }
    
    // Call Neynar API to complete the signer approval
    // The exact endpoint and parameters depend on Neynar's API
    try {
      const response = await fetch(`${NEYNAR_API_URL}/farcaster/signer/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_key': NEYNAR_API_KEY,
        },
        body: JSON.stringify({
          fid: fid,
          signer_uuid: signerUuid,
          signature: signature, // User's signature approving the signer
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to approve signer with Neynar');
      }

      const approvalData = await response.json();
      console.log('Signer approved with Neynar:', approvalData);
      
      // Update our database
      const { error: updateError } = await supabase
        .from('neynar_signers')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('fid', fid)
        .eq('signer_uuid', signerUuid);
        
      if (updateError) {
        console.error('Error updating signer status:', updateError);
        // Continue anyway since Neynar approval succeeded
      }
      
      // Set up automated likes/recasts for daily winner announcements
      // This would involve:
      // 1. Storing the approved signer credentials
      // 2. Setting up a cron job or event listener for new winner announcements
      // 3. Using Neynar SDK to like/recast on behalf of the user
      
      // For now, we'll just mark it as approved
      // The actual automation would be handled by a separate background job
      
      return NextResponse.json({ 
        success: true, 
        message: 'Signer approved successfully',
        data: approvalData
      });
      
    } catch (neynarError) {
      console.error('Error approving signer with Neynar:', neynarError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to approve signer with Neynar' 
      }, { status: 500 });
    }
    
  } catch (error: unknown) {
    console.error('Signer approval error:', error);
    
    let errorMessage = 'Failed to approve signer';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 