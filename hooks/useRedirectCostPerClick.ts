import { useState, useEffect } from "react";
import { useAccount } from "wagmi";

type RedirectCostPerClickData = {
  auction_id: number;
  date: string;
  usd_value: number;
  click_count: number;
  unique_clicks: number;
  cost_per_click: number;
  winning_address: string;
};

type RedirectCostPerClickStats = {
  totalAuctions: number;
  auctionsWithClicks: number;
  totalClicks: number;
  totalUsdValue: number;
  minAuctionId: number;
  maxAuctionId: number;
  earliestAuctionIdWithClicks: number;
};

type UseRedirectCostPerClickReturn = {
  auctionData: RedirectCostPerClickData[];
  stats?: RedirectCostPerClickStats;
  isLoading: boolean;
  error: Error | null;
};

export function useRedirectCostPerClick(): UseRedirectCostPerClickReturn {
  const { address } = useAccount();
  const [data, setData] = useState<UseRedirectCostPerClickReturn>({
    auctionData: [],
    isLoading: true,
    error: null
  });

  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        const response = await fetch('/api/redirect-cost-per-click', {
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
        console.error('Error fetching redirect cost per click data:', error);
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('An unknown error occurred')
        }));
      }
    };

    fetchData();
  }, [address]);

  return data;
} 