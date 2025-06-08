"use client";

import { useState, useEffect, useCallback } from "react";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { SUBGRAPH_URL } from "@/config/subgraph";
import { getPublicClient } from "@wagmi/core";
import { wagmiConfig } from "@/config/wagmiConfig";
import QRAuctionV3 from "../abi/QRAuctionV3.json";

const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY;

type QRData = {
  validUntil: bigint;
  urlString: string;
};

type Auction = {
  tokenId: bigint;
  highestBid: bigint;
  highestBidder: string;
  highestBidderName?: string;
  startTime: bigint;
  endTime: bigint;
  settled: boolean;
  qrMetadata: QRData;
};

interface SubgraphBid {
  id: string;
  tokenId: string;
  bidder: string;
  amount: string;
  endTime: string;
  urlString: string;
  name?: string;
  blockTimestamp: string;
}

interface SubgraphSettled {
  id: string;
  tokenId: string;
  winner: string;
  amount: string;
  urlString: string;
  name?: string;
  blockTimestamp: string;
}

interface SubgraphCreated {
  id: string;
  tokenId: string;
  startTime: string;
  endTime: string;
  blockTimestamp: string;
}

// Global auction cache to improve navigation performance
const auctionCache = new Map<string, Auction>();

// Export a function to clear all auction caches (useful after settlements)
export const clearAllAuctionCaches = () => {
  auctionCache.clear();
  console.log('[Cache] Cleared all auction caches');
};

export function useFetchAuctionDetailsSubgraph(tokenId?: bigint) {
  const [auctionDetail, setAuctiondetails] = useState<Auction>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isUsingRpcFallback, setIsUsingRpcFallback] = useState(false);

  const fetchAuctionFromSubgraph = useCallback(async (tokenId: bigint) => {
    // const isLegacyAuction = tokenId <= 22n;
    //const isV2Auction = tokenId >= 23n && tokenId <= 61n;
    const isV3Auction = tokenId >= 62n;

    // Determine which entity to query based on tokenId
    let entityName = "auctionSettleds";
    let bidEntityName = "auctionBids";
    let createdEntityName = "auctionCreateds";

    if (isV3Auction) {
      entityName = "qrauctionV3AuctionSettleds";
      bidEntityName = "qrauctionV3AuctionBids";
      createdEntityName = "qrauctionV3AuctionCreateds";
    }
    // Note: V2 auctions are incorrectly indexed under V1 entities

    const query = `
      query GetAuctionDetails($tokenId: BigInt!) {
        ${entityName}(where: { tokenId: $tokenId }) {
          id
          tokenId
          winner
          amount
          urlString
          ${isV3Auction ? 'name' : ''}
          blockTimestamp
        }
        ${createdEntityName}(where: { tokenId: $tokenId }) {
          id
          tokenId
          startTime
          endTime
          blockTimestamp
        }
        ${bidEntityName}(
          where: { tokenId: $tokenId }
          orderBy: amount
          orderDirection: desc
          first: 1
        ) {
          id
          tokenId
          bidder
          amount
          endTime
          urlString
          ${isV3Auction ? 'name' : ''}
          blockTimestamp
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          tokenId: tokenId.toString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Subgraph query error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }, []);

  const fetchDetails = useCallback(async () => {
    if (!tokenId) return;

    const cacheKey = `${tokenId}-subgraph`;

    // Check cache first (but skip if we're retrying from RPC fallback)
    if (auctionCache.has(cacheKey) && !isUsingRpcFallback) {
      setAuctiondetails(auctionCache.get(cacheKey));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchAuctionFromSubgraph(tokenId);

      const isV3Auction = tokenId >= 62n;
      const settledKey = isV3Auction ? 'qrauctionV3AuctionSettleds' : 'auctionSettleds';
      const createdKey = isV3Auction ? 'qrauctionV3AuctionCreateds' : 'auctionCreateds';
      const bidKey = isV3Auction ? 'qrauctionV3AuctionBids' : 'auctionBids';

      const settled = data[settledKey]?.[0] as SubgraphSettled | undefined;
      const created = data[createdKey]?.[0] as SubgraphCreated | undefined;
      const highestBid = data[bidKey]?.[0] as SubgraphBid | undefined;

      if (!created) {
        // If subgraph doesn't have the auction yet, try fetching from RPC
        // This is especially important for newly created auctions
        console.log(`[Subgraph] No auction found in subgraph for tokenId ${tokenId}, trying RPC fallback`);
        
        if (isV3Auction) {
          try {
            const publicClient = getPublicClient(wagmiConfig, { chainId: base.id });
            const contractAddress = process.env.NEXT_PUBLIC_QRAuctionV3 as Address;
            
            // Check if this is the current auction
            const currentAuction = await publicClient.readContract({
              address: contractAddress,
              abi: QRAuctionV3.abi,
              functionName: 'auction',
            }) as [string, string, string, string, string, boolean, { urlString: string }];
            
            if (currentAuction && BigInt(currentAuction[0]) === tokenId) {
              console.log(`[RPC Fallback] Found auction #${tokenId} via RPC`);
              
              // Build auction object from RPC data
              const auction: Auction = {
                tokenId: BigInt(currentAuction[0]),
                highestBid: BigInt(currentAuction[1]),
                highestBidder: currentAuction[2],
                startTime: BigInt(currentAuction[3]),
                endTime: BigInt(currentAuction[4]),
                settled: currentAuction[5],
                qrMetadata: {
                  validUntil: BigInt(currentAuction[4]),
                  urlString: currentAuction[6]?.urlString || "",
                },
              };
              
              setAuctiondetails(auction);
              setLoading(false);
              setIsUsingRpcFallback(true);
              // Don't cache RPC data - let subgraph be the source of truth once it catches up
              
              // Set up a retry to check subgraph again in a few seconds
              if (retryCount < 3) {
                setTimeout(() => {
                  console.log(`[Retry] Checking subgraph again for auction #${tokenId} (attempt ${retryCount + 1})`);
                  setRetryCount(prev => prev + 1);
                }, 5000); // Retry after 5 seconds
              }
              
              return;
            }
          } catch (rpcError) {
            console.error(`[RPC Fallback] Error fetching from RPC:`, rpcError);
          }
        }
        
        throw new Error(`No auction found with tokenId ${tokenId}`);
      }

      // Build auction object
      const auction: Auction = {
        tokenId: BigInt(created.tokenId),
        highestBid: highestBid ? BigInt(highestBid.amount) : 0n,
        highestBidder: highestBid?.bidder || settled?.winner || "0x0000000000000000000000000000000000000000",
        startTime: BigInt(created.startTime),
        endTime: BigInt(created.endTime),
        settled: !!settled,
        qrMetadata: {
          validUntil: BigInt(created.endTime),
          urlString: highestBid?.urlString || settled?.urlString || "",
        },
      };

      // For V3 auctions, use the name from the subgraph
      if (isV3Auction && (highestBid?.name || settled?.name)) {
        auction.highestBidderName = highestBid?.name || settled?.name;
      }

      setAuctiondetails(auction);
      auctionCache.set(cacheKey, auction);
      setIsUsingRpcFallback(false); // We got data from subgraph

      // For V1/V2 auctions or if V3 doesn't have a name, fetch ENS/basename asynchronously
      if (!auction.highestBidderName && auction.highestBidder !== "0x0000000000000000000000000000000000000000") {
        try {
          const name = await getName({
            address: auction.highestBidder as Address,
            chain: base,
          });

          if (name) {
            const updatedAuction = {
              ...auction,
              highestBidderName: name,
            };
            setAuctiondetails(updatedAuction);
            auctionCache.set(cacheKey, updatedAuction);
          }
        } catch (nameError) {
          console.error("Error fetching ENS/basename:", nameError);
        }
      }
    } catch (err) {
      console.error("Error fetching auction details from subgraph:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [tokenId, fetchAuctionFromSubgraph, isUsingRpcFallback]);

  useEffect(() => {
    // Reset retry count when tokenId changes
    setRetryCount(0);
    setIsUsingRpcFallback(false);
    fetchDetails();
  }, [tokenId, fetchDetails]); // Include fetchDetails dependency

  // Retry effect when retry count changes
  useEffect(() => {
    if (retryCount > 0 && tokenId && isUsingRpcFallback) {
      console.log(`[Retry] Attempting to fetch from subgraph again for auction #${tokenId}`);
      fetchDetails();
    }
  }, [retryCount, tokenId, isUsingRpcFallback, fetchDetails]);

  const forceRefetch = useCallback(async () => {
    if (!tokenId) return;

    const cacheKey = `${tokenId}-subgraph`;
    auctionCache.delete(cacheKey);

    await fetchDetails();
  }, [tokenId, fetchDetails]);

  // Clear cache for a specific auction (useful when other auctions settle)
  const clearCacheForAuction = useCallback((auctionId: bigint) => {
    const cacheKey = `${auctionId}-subgraph`;
    auctionCache.delete(cacheKey);
  }, []);

  return { 
    auctionDetail, 
    refetch: fetchDetails, 
    forceRefetch, 
    loading, 
    error,
    clearCacheForAuction 
  };
}
