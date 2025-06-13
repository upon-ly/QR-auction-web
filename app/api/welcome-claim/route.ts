import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    const { privyId } = await request.json()

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
} 