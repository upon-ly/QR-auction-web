import { useQuery } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { useIsMiniApp } from '@/hooks/useIsMiniApp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useRedirectClickTracking(auctionId: number | null) {
  const { user } = usePrivy();
  const { address } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  const { isMiniApp, isLoading: isMiniAppLoading } = useIsMiniApp();
  
  // Get smart wallet address from user's linked accounts
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => 
    account.type === 'smart_wallet'
  )?.address;
  
  // Use appropriate wallet address
  const walletAddress = smartWalletAddress || smartWalletClient?.account?.address || address;
  
  return useQuery({
    queryKey: ['redirectClickTracking', auctionId, user?.id, walletAddress],
    queryFn: async () => {
      if (!auctionId) {
        return { hasVisited: false };
      }

      if (isMiniApp) {
        // Get context from frame SDK
        const context = await frameSdk.getContext();
        if (context?.user?.fid) {
          // Ensure FID is a number
          const fid = Number(context.user.fid);
          
          // Check by FID
          const { data } = await supabase
            .from('redirect_click_tracking')
            .select('id, created_at')
            .eq('auction_id', auctionId)
            .eq('fid', fid)
            .maybeSingle();

          if (data) {
            return { hasVisited: true, visitedAt: data.created_at };
          }
        }
      } else if (walletAddress) {
        // Web context - check by wallet address
        const { data, error } = await supabase
          .from('redirect_click_tracking')
          .select('id, created_at')
          .eq('auction_id', auctionId)
          .eq('eth_address', walletAddress)
          .single();

        if (!error && data) {
          return { hasVisited: true, visitedAt: data.created_at };
        }
      }

      return { hasVisited: false };
    },
    enabled: !!auctionId && auctionId > 0 && !isMiniAppLoading,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 60 * 1000, // 1 minute
    refetchOnMount: true,
    refetchOnWindowFocus: false
  });
}