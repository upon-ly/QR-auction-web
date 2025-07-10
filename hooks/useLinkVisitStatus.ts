import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { frameSdk } from '@/lib/frame-sdk-singleton';

interface LinkVisitStatus {
  hasVisited: boolean;
  visitedAt: string | null;
  visitUsername: string | null;
  hasClaimed: boolean;
  claimTxHash: string | null;
  claimSuccess: boolean;
  claimUsername: string | null;
}

export function useLinkVisitStatus(auctionId: number | null) {
  const { user, authenticated } = usePrivy();
  
  return useQuery<LinkVisitStatus>({
    queryKey: ['linkVisitStatus', auctionId, user?.id],
    queryFn: async () => {
      if (!auctionId) {
        throw new Error('Auction ID required');
      }

      // Detect if we're in a mini-app
      const isMiniApp = await frameSdk.isInMiniApp() || (await frameSdk.getContext()).client.clientFid == 309857;
      
      const params: Record<string, string> = {
        auctionId: auctionId.toString()
      };

      if (isMiniApp) {
        // Get context from frame SDK
        const context = await frameSdk.getContext();
        if (context?.user?.fid) {
          params.fid = context.user.fid.toString();
          params.username = context.user.username || '';
        }
      } else if (authenticated && user) {
        // Web context - use ETH address
        const walletAddress = user.wallet?.address || 
          user.linkedAccounts?.find((acc: { type: string }) => acc.type === 'wallet')?.address;
        
        if (walletAddress) {
          params.ethAddress = walletAddress;
        }
      }

      const searchParams = new URLSearchParams(params);
      const response = await fetch(`/api/link-visit/check-visited?${searchParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to check visit status');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to check visit status');
      }

      return data.data;
    },
    enabled: !!auctionId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 60 * 1000, // 1 minute
  });
}