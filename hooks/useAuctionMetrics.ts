import { useQuery } from '@tanstack/react-query';
import { gql, request } from 'graphql-request';
import { useTokenPrice } from './useTokenPrice';
import useEthPrice from './useEthPrice';

const SUBGRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/9BQvuZLRAHVaMomrczg5e66mfdcDmzLqZionmyAJ6f13';
const API_KEY = 'f735eebfd7149ebd7c61f5d3d6074bfd';
const HEADERS = { Authorization: `Bearer ${API_KEY}` };

interface AuctionMetrics {
  totalETHBidVolume: string;
  totalQRBidVolume: string;
  totalETHBidCount: string;
  totalQRBidCount: string;
  lastUpdatedTimestamp: string;
}

interface MetricsResponse {
  auctionMetrics: AuctionMetrics;
}

const METRICS_QUERY = gql`
{
  auctionMetrics(id: "global") {
    totalETHBidVolume
    totalQRBidVolume
    totalETHBidCount
    totalQRBidCount
    lastUpdatedTimestamp
  }
}`;

export function useAuctionMetrics() {
  const { ethPrice, isLoading: ethPriceLoading } = useEthPrice();
  const { priceUsd: qrPrice } = useTokenPrice();

  return useQuery({
    queryKey: ['auctionMetrics'],
    queryFn: async () => {
      const data = await request<MetricsResponse>(SUBGRAPH_URL, METRICS_QUERY, {}, HEADERS);
      
      // Parse the metrics data
      const metrics = data.auctionMetrics;
      
      // Convert from Wei to Ether (18 decimals)
      const totalETHBidVolume = parseFloat(metrics.totalETHBidVolume) / 1e18;
      const totalQRBidVolume = parseFloat(metrics.totalQRBidVolume) / 1e18;
      
      // Get current prices - ethPrice returns { ethereum: { usd: number } }
      const ethPriceUsd = ethPrice?.ethereum?.usd || 0;
      
      // Calculate USD values
      const ethBidValueUsd = totalETHBidVolume * ethPriceUsd;
      const qrBidValueUsd = totalQRBidVolume * (qrPrice || 0);
      const totalBidValueUsd = ethBidValueUsd + qrBidValueUsd;
      
      return {
        raw: metrics,
        totalETHBidVolume,
        totalQRBidVolume,
        totalETHBidCount: parseInt(metrics.totalETHBidCount),
        totalQRBidCount: parseInt(metrics.totalQRBidCount),
        lastUpdatedTimestamp: parseInt(metrics.lastUpdatedTimestamp),
        ethBidValueUsd,
        qrBidValueUsd,
        totalBidValueUsd,
        ethPriceUsd,
        qrPriceUsd: qrPrice || 0
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    enabled: !ethPriceLoading && ethPrice !== undefined && qrPrice !== null
  });
}   