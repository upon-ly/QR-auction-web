import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PrivyClient } from '@privy-io/server-auth'

// Initialize Privy client for server-side authentication
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  process.env.PRIVY_APP_SECRET || ''
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        let { privyId, authToken } = body

        // Check for auth token in header if not in body
        if (!authToken) {
            const authHeader = request.headers.get('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
            }
        }

        // Verify auth token is provided
        if (!authToken) {
            return NextResponse.json({ 
                error: 'Authentication required. Please provide auth token.' 
            }, { status: 401 });
        }

        // Verify the Privy auth token and extract userId
        let verifiedPrivyId: string;
        try {
            const verifiedClaims = await privyClient.verifyAuthToken(authToken);
            
            if (!verifiedClaims.userId) {
                throw new Error('No user ID in token claims');
            }
            
            verifiedPrivyId = verifiedClaims.userId;
            console.log(`✅ WELCOME CLAIM AUTH: Verified Privy User: ${verifiedPrivyId}`);
            
            // If privyId was provided in body, verify it matches the token
            if (privyId && privyId !== verifiedPrivyId) {
                console.log(`🚫 PRIVY ID MISMATCH: Body=${privyId}, Token=${verifiedPrivyId}`);
                return NextResponse.json({ 
                    error: 'Privy ID mismatch with auth token' 
                }, { status: 400 });
            }
            
            // Use the verified privy ID from the token
            privyId = verifiedPrivyId;
            
        } catch (error) {
            console.log(`🚫 WELCOME CLAIM AUTH ERROR: Invalid auth token:`, error);
            return NextResponse.json({ 
                error: 'Invalid authentication. Please sign in again.' 
            }, { status: 401 });
        }

        // search supabase `welcome_claims` table for privyId
        const { data, error } = await supabase
            .from('welcome_claims')
            .select('*')
            .eq('privy_id', privyId)
        if (error) {
            // RLS or other errors
            return NextResponse.json({ error: 'SUPABASE_ERROR', details: error.message }, { status: 500 })
        }

        // if a record is found, return {error: 'ALREADY_CLAIMED'}
        if (data.length > 0) {
            return NextResponse.json({ error: 'ALREADY_CLAIMED' }, { status: 400 })
        }

        // if no record is found, create a new record
        const { error: newError } = await supabase
            .from('welcome_claims')
            .insert({ privy_id: privyId })
        if (newError) {
            return NextResponse.json({ error: 'SUPABASE_ERROR', details: newError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Welcome claim error:', error);
        return NextResponse.json({ 
            error: 'Internal server error' 
        }, { status: 500 });
    }
} 