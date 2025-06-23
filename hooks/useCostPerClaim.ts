import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

type CostPerClaimData = {
  auction_id: number;
  date: string;
  usd_value: number;
  click_count: number;
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

export function useCostPerClaim(): UseCostPerClaimReturn {
  const { address } = useAccount();
  const [data, setData] = useState<Omit<UseCostPerClaimReturn, 'updateQRPrice'>>({
    auctionData: [],
    isLoading: true,
    error: null
  });

  const fetchData = async () => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/cost-per-claim', {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const resultData = await response.json();
      
      setData({
        auctionData: resultData.auctionData,
        stats: resultData.stats,
        isLoading: false,
        error: null
      });
    } catch (error) {
      console.error('Error fetching cost per claim data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('An unknown error occurred')
      }));
    }
  };

  useEffect(() => {
    fetchData();
  }, [address]);

  const updateQRPrice = async (auctionId: number, qrPrice: number) => {
    if (!address) throw new Error('No wallet connected');
    
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
    
    // Refetch data after update
    await fetchData();
  };

  return {
    ...data,
    updateQRPrice
  };
}