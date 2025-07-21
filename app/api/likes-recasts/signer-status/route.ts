import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNeynarClient } from '@/lib/neynar';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signer_uuid = searchParams.get('signer_uuid');
    const isPolling = searchParams.get('polling') === 'true';

    if (!signer_uuid) {
      return NextResponse.json(
        { error: 'signer_uuid is required' },
        { status: 400 }
      );
    }

    // First check our local database for the signer status
    const { data: localSigner, error: dbError } = await supabase
      .from('neynar_signers_updated')
      .select('*')
      .eq('signer_uuid', signer_uuid)
      .single();

    if (dbError && dbError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Database error:', dbError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // If no local record exists, the signer UUID might be invalid
    if (!localSigner) {
      return NextResponse.json(
        { error: 'Signer not found' },
        { status: 404 }
      );
    }

    // If we have a local record and it's already approved, return it
    if (localSigner.status === 'approved') {
      return NextResponse.json({
        signer_uuid: localSigner.signer_uuid,
        status: localSigner.status,
        public_key: localSigner.public_key
      }, { status: 200 });
    }

    // If this is a polling request and status is pending_approval, check with Neynar
    if (isPolling && localSigner.status === 'pending_approval') {
      try {
        const neynarClient = getNeynarClient();
        
        // Check the actual signer status from Neynar
        const signerStatus = await neynarClient.lookupSigner({ signerUuid: signer_uuid });
        
        // If the signer is now approved, update our database
        if (signerStatus.status === 'approved') {
          await supabase
            .from('neynar_signers_updated')
            .update({
              status: 'approved',
              approved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('signer_uuid', signer_uuid);

          return NextResponse.json({
            signer_uuid: localSigner.signer_uuid,
            status: 'approved',
            public_key: localSigner.public_key
          }, { status: 200 });
        }
        
      } catch (neynarError) {
        console.log('Error checking signer status from Neynar:', neynarError);
        // Continue with local status if Neynar call fails
      }
    }

    // Return the current database status without checking Neynar
    return NextResponse.json({
      signer_uuid: localSigner.signer_uuid,
      status: localSigner.status,
      public_key: localSigner.public_key
    }, { status: 200 });

  } catch (error) {
    console.error('Error checking signer status:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
} 