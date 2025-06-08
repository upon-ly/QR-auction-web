"use client";

import { useCallback } from "react";
import { SUBGRAPH_URL } from "@/config/subgraph";

const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY;

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
};

// Global cache for settled auctions
const settledAuctionsCache = new Map<string, AuctionType[]>();
let lastFetchTimestamp: number | null = null;

export function useFetchSettledAucSubgraph(tokenId?: bigint) {
  const fetchHistoricalAuctions = useCallback(async () => {
    // Check cache (60 second TTL)
    const now = Date.now();
    const cacheTtlMs = 60000;

    if (
      lastFetchTimestamp && 
      (now - lastFetchTimestamp) < cacheTtlMs && 
      settledAuctionsCache.has("all-settled")
    ) {
      console.log("Using cached settled auctions from subgraph");
      return settledAuctionsCache.get("all-settled");
    }

    try {
      console.log("Fetching settled auctions from subgraph");

      // Query all versions of settled auctions
      // Note: V3 might not be available if subgraph is still indexing
      const query = `
        query GetAllSettledAuctions {
          # V1 Auctions (tokenId <= 22)
          auctionSettleds(first: 1000, orderBy: tokenId, orderDirection: asc) {
            id
            tokenId
            winner
            amount
            urlString
            blockTimestamp
          }
          # Note: V2 auctions are incorrectly indexed under V1 entities
          # V3 Auctions (tokenId >= 62)
          qrauctionV3AuctionSettleds(first: 1000, orderBy: tokenId, orderDirection: asc) {
            id
            tokenId
            winner
            amount
            urlString
            name
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
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Subgraph request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(`Subgraph query error: ${JSON.stringify(data.errors)}`);
      }

      // Combine and format all settled auctions
      const allSettled: AuctionType[] = [];

      // Process V1 auctions
      if (data.data.auctionSettleds) {
        data.data.auctionSettleds.forEach((auction: AuctionType) => {
          allSettled.push({
            tokenId: BigInt(auction.tokenId),
            winner: auction.winner,
            amount: BigInt(auction.amount),
            url: auction.url === "0x" ? 
              (process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string) : 
              auction.url,
          });
        });
      }

      // Note: V2 auctions are incorrectly indexed under V1 entities

      // Process V3 auctions
      if (data.data.qrauctionV3AuctionSettleds) {
        data.data.qrauctionV3AuctionSettleds.forEach((auction: AuctionType) => {
          allSettled.push({
            tokenId: BigInt(auction.tokenId),
            winner: auction.winner,
            amount: BigInt(auction.amount),
            url: auction.url === "0x" ? 
              (process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string) : 
              auction.url,
          });
        });
      }

      // Sort by tokenId
      allSettled.sort((a, b) => Number(a.tokenId - b.tokenId));

      // Update cache
      lastFetchTimestamp = now;
      settledAuctionsCache.set("all-settled", allSettled);

      console.log(`Fetched ${allSettled.length} settled auctions from subgraph`);
      return allSettled;
    } catch (error) {
      console.error("Error fetching settled auctions from subgraph:", error);
      throw error;
    }
  }, []);

  // If a specific tokenId is provided, filter for auctions from that contract version
  const fetchHistoricalAuctionsForToken = useCallback(async () => {
    if (!tokenId) {
      return fetchHistoricalAuctions();
    }

    const allAuctions = await fetchHistoricalAuctions();
    if (!allAuctions) return [];

    // Filter based on contract version
    if (tokenId <= 22n) {
      // V1 auctions
      return allAuctions.filter(a => a.tokenId <= 22n);
    } else if (tokenId >= 23n && tokenId <= 61n) {
      // V2 auctions
      return allAuctions.filter(a => a.tokenId >= 23n && a.tokenId <= 61n);
    } else {
      // V3 auctions
      return allAuctions.filter(a => a.tokenId >= 62n);
    }
  }, [tokenId, fetchHistoricalAuctions]);

  return { 
    fetchHistoricalAuctions: tokenId ? fetchHistoricalAuctionsForToken : fetchHistoricalAuctions 
  };
}