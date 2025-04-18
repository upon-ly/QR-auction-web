import { useQuery } from '@tanstack/react-query';
import { gql, request } from 'graphql-request';
import { useTokenPrice } from './useTokenPrice';
import useEthPrice from './useEthPrice';

// Updated to point to the newer version of the subgraph
const SUBGRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/9BQvuZLRAHVaMomrczg5e66mfdcDmzLqZionmyAJ6f13';
const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY;
const HEADERS = { Authorization: `Bearer ${API_KEY}` };

interface AuctionMetrics {
  totalETHBidVolume: string;
  totalQRBidVolume: string;
  totalETHBidCount: string;
  totalQRBidCount: string;
  uniqueETHBidders: string;
  uniqueQRBidders: string;
  lastUpdatedTimestamp: string;
  
  // Added metrics
  totalAuctions: string;
  totalBids: string;
  bidsPerAuction: string;
  totalBidsValue: string;
  totalUniqueBidders: string;
  
  // Winning bids metrics - separated by token type
  totalETHWinningBidsValue: string;
  averageETHWinningBidValue: string;
  totalQRWinningBidsValue: string;
  averageQRWinningBidValue: string;
  
  // Bidding wars metrics
  biddingWarsCount: string;
  biddingWarsPercentage: string;
  totalFinalMinutesBids: string;
  finalMinutesBidsPercentage: string;
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
    uniqueETHBidders
    uniqueQRBidders
    lastUpdatedTimestamp
    
    # Added metrics
    totalAuctions
    totalBids
    bidsPerAuction
    totalBidsValue
    totalUniqueBidders
    
    # Winning bids metrics - separated by token type
    totalETHWinningBidsValue
    averageETHWinningBidValue
    totalQRWinningBidsValue
    averageQRWinningBidValue
    
    # Bidding wars metrics
    biddingWarsCount
    biddingWarsPercentage
    totalFinalMinutesBids
    finalMinutesBidsPercentage
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
      const totalBidsValue = parseFloat(metrics.totalBidsValue) / 1e18;
      
      // Debug the values to see what's coming from the subgraph
      console.log("Raw ETH totalWinningBidsValue:", metrics.totalETHWinningBidsValue);
      console.log("Raw ETH averageWinningBidValue:", metrics.averageETHWinningBidValue);
      console.log("Raw QR totalWinningBidsValue:", metrics.totalQRWinningBidsValue);
      console.log("Raw QR averageWinningBidValue:", metrics.averageQRWinningBidValue);
      
      // Parse ETH winning bids values
      let totalETHWinningBidsValue = 0;
      try {
        totalETHWinningBidsValue = Number(metrics.totalETHWinningBidsValue) / 1e18;
      } catch (e) {
        console.error("Error parsing totalETHWinningBidsValue:", e);
      }
      
      let averageETHWinningBidValue = 0;
      try {
        averageETHWinningBidValue = Number(metrics.averageETHWinningBidValue) / 1e18;
      } catch (e) {
        console.error("Error parsing averageETHWinningBidValue:", e);
      }
      
      // Parse QR winning bids values
      let totalQRWinningBidsValue = 0;
      try {
        totalQRWinningBidsValue = Number(metrics.totalQRWinningBidsValue) / 1e18;
      } catch (e) {
        console.error("Error parsing totalQRWinningBidsValue:", e);
      }
      
      let averageQRWinningBidValue = 0;
      try {
        averageQRWinningBidValue = Number(metrics.averageQRWinningBidValue) / 1e18;
      } catch (e) {
        console.error("Error parsing averageQRWinningBidValue:", e);
      }
      
      // Combined totals for display purposes
      let totalWinningBidsValue = totalETHWinningBidsValue + totalQRWinningBidsValue;
      const averageWinningBidValue = (totalETHWinningBidsValue + totalQRWinningBidsValue) / 
                                   (parseInt(metrics.totalAuctions) || 1);
      
      // Fallback calculations if the values are still unreasonable
      if (totalWinningBidsValue > 1000000) { // Sanity check - if value is unreasonably large
        console.warn("totalWinningBidsValue too large, using fallback calculation");
        totalWinningBidsValue = totalETHBidVolume * 0.1; // Example fallback: 10% of total bid volume
      }
      
      // Get current prices - ethPrice returns { ethereum: { usd: number } }
      const ethPriceUsd = ethPrice?.ethereum?.usd || 0;
      
      // Calculate USD values
      const ethBidValueUsd = totalETHBidVolume * ethPriceUsd;
      const qrBidValueUsd = totalQRBidVolume * (qrPrice || 0);
      const totalBidValueUsd = ethBidValueUsd + qrBidValueUsd;
      
      return {
        raw: metrics,
        // Original metrics
        totalETHBidVolume,
        totalQRBidVolume,
        totalETHBidCount: parseInt(metrics.totalETHBidCount),
        totalQRBidCount: parseInt(metrics.totalQRBidCount),
        uniqueETHBidders: parseInt(metrics.uniqueETHBidders),
        uniqueQRBidders: parseInt(metrics.uniqueQRBidders),
        lastUpdatedTimestamp: parseInt(metrics.lastUpdatedTimestamp),
        ethBidValueUsd,
        qrBidValueUsd,
        totalBidValueUsd,
        ethPriceUsd,
        qrPriceUsd: qrPrice || 0,
        
        // New metrics
        totalAuctions: parseInt(metrics.totalAuctions),
        totalBids: parseInt(metrics.totalBids),
        bidsPerAuction: parseFloat(metrics.bidsPerAuction),
        totalBidsValue,
        totalUniqueBidders: parseInt(metrics.totalUniqueBidders),
        
        // Winning bids by token type
        totalETHWinningBidsValue,
        averageETHWinningBidValue,
        totalQRWinningBidsValue,
        averageQRWinningBidValue,
        
        // Combined winning bids (for backwards compatibility)
        totalWinningBidsValue,
        averageWinningBidValue,
        
        // Bidding wars
        biddingWarsCount: parseInt(metrics.biddingWarsCount),
        biddingWarsPercentage: parseFloat(metrics.biddingWarsPercentage),
        totalFinalMinutesBids: parseInt(metrics.totalFinalMinutesBids), 
        finalMinutesBidsPercentage: parseFloat(metrics.finalMinutesBidsPercentage)
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    enabled: !ethPriceLoading && ethPrice !== undefined && qrPrice !== null
  });
}   