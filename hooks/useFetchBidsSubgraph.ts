"use client";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { SUBGRAPH_URL } from "@/config/subgraph";

const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY;

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
  name?: string;
  _id: string;
};

type SubgraphBid = {
  tokenId: string;
  bidder: string;
  amount: string;
  extended: boolean;
  endTime: string;
  urlString: string;
  name?: string;
  blockTimestamp: string;
  transactionHash: string;
};

export function useFetchBidsSubgraph(tokenId?: bigint) {
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 61n;
  const isV3Auction = tokenId && tokenId >= 62n;

  const fetchHistoricalAuctions = useCallback(async () => {
    try {
      // Determine which entity to query based on tokenId
      let entityName = "auctionBids";

      if (isV3Auction) {
        entityName = "qrauctionV3AuctionBids";
      }
      // Note: V2 auctions are incorrectly indexed under V1 entities

      const query = `
        query GetAuctionBids($tokenId: BigInt!) {
          ${entityName}(
            where: { tokenId: $tokenId }
            orderBy: blockTimestamp
            orderDirection: asc
            first: 1000
          ) {
            id
            tokenId
            bidder
            amount
            extended
            endTime
            urlString
            ${isV3Auction ? 'name' : ''}
            blockTimestamp
            transactionHash
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
            tokenId: tokenId?.toString() || "0",
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

      const bids = data.data[entityName] || [];

      const formatted: AuctionType[] = bids.map((bid: SubgraphBid) => ({
        tokenId: BigInt(bid.tokenId),
        bidder: bid.bidder,
        amount: BigInt(bid.amount),
        extended: bid.extended,
        endTime: BigInt(bid.endTime),
        url: bid.urlString === "0x" || !bid.urlString ? 
              (process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string) : 
              bid.urlString,
        name: bid.name, // Will be undefined for V1/V2, populated for V3 when indexed
        _id: uuidv4(),
      }));

      return formatted;
    } catch (error) {
      console.error("Error fetching bids from subgraph:", error);
      return [];
    }
  }, [tokenId, isLegacyAuction, isV2Auction, isV3Auction]);

  return { fetchHistoricalAuctions };
}