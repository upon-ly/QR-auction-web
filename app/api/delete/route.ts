import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  await supabase
    .from('link_visit_claims')
    .delete()
    .gt('claimed_at', new Date(new Date().setDate(new Date().getDate() - 1)).toISOString())
    .or(`user_id.eq.did:privy:cmbjsk07z01h8l40meax6d101,fid.eq.1020,eth_address.eq.0xE08D1B1D3800BeBD1ecAc887304fd53A283334aA,eth_address.eq.0x363E8f2E9e6A901bC6630387BecDEb3508D390DE,user_id.eq.did:privy:cmacm8oks02j6js0mxlmqfvbh,user_id.eq.did:privy:cmcjm1gti01lcjy0loymqvqm5`);

		
  await supabase
    .from('welcome_claims')
    .delete()
    .gt('claimed_at', new Date(new Date().setDate(new Date().getDate() - 1)).toISOString())
    .or(`user_id.eq.did:privy:cmbjsk07z01h8l40meax6d101,user_id.eq.did:privy:cmacm8oks02j6js0mxlmqfvbh,user_id.eq.did:privy:cmcjm1gti01lcjy0loymqvqm5`);
    
  return new Response('Success');
}
