import { useAccount } from "wagmi";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type CostPerClaimData = {
  auction_id: number;
  date: string;
  usd_value: number;
  click_count: number;
  web_click_count: number;
  mini_app_click_count: number;
  mini_app_spam_claims: number;
  mini_app_valid_claims: number;
  cost_per_click: number;
  qr_price_usd: number;
  qr_reward_per_claim: number;
  qr_reward_value_usd: number;
  cost_per_claim: number;
};

type CostPerClaimStats = {
  totalAuctions: number;
  auctionsWithClicks: number;
  totalClicks: number;
  totalUsdValue: number;
  minAuctionId: number;
  maxAuctionId: number;
  earliestAuctionIdWithClicks: number;
};

type UseCostPerClaimReturn = {
  auctionData: CostPerClaimData[];
  stats?: CostPerClaimStats;
  isLoading: boolean;
  error: Error | null;
  updateQRPrice: (auctionId: number, qrPrice: number) => Promise<void>;
};

async function fetchCostPerClaimData(address: string) {
  const response = await fetch('/api/cost-per-claim', {
    headers: {
      'Authorization': `Bearer ${address}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

async function updateQRPriceApi(address: string, auctionId: number, qrPrice: number) {
  const response = await fetch('/api/cost-per-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${address}`
    },
    body: JSON.stringify({
      auction_id: auctionId,
      qr_price_usd: qrPrice
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to update QR price');
  }
  
  return response.json();
}

export function useCostPerClaim(): UseCostPerClaimReturn {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  const {
    data: responseData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['costPerClaim', address],
    queryFn: () => fetchCostPerClaimData(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  const updateMutation = useMutation({
    mutationFn: ({ auctionId, qrPrice }: { auctionId: number; qrPrice: number }) =>
      updateQRPriceApi(address!, auctionId, qrPrice),
    onSuccess: () => {
      // Invalidate and refetch the data after successful update
      queryClient.invalidateQueries({ queryKey: ['costPerClaim', address] });
    },
  });

  const updateQRPrice = async (auctionId: number, qrPrice: number) => {
    if (!address) throw new Error('No wallet connected');
    return updateMutation.mutateAsync({ auctionId, qrPrice });
  };

  return {
    auctionData: responseData?.auctionData || [],
    stats: responseData?.stats,
    isLoading,
    error: error as Error | null,
    updateQRPrice,
  };
}