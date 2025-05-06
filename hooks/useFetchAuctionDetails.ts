"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address } from "viem";
import { wagmiConfig } from "@/config/wagmiConfig";
import { useEffect, useState, useRef, useCallback } from "react";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";

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

type AuctionResponse = [
  tokenId: bigint,
  highestBid: bigint,
  highestBidder: string,
  startTime: bigint,
  endTime: bigint,
  settled: boolean,
  qrMetadata: QRData
];

// Global auction cache to improve navigation performance
const auctionCache = new Map<string, Auction>();

export function useFetchAuctionDetails(tokenId?: bigint) {
  const [auctionDetail, setAuctiondetails] = useState<Auction>();
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 35n;
  const isV3Auction = tokenId && tokenId >= 36n;
  const lastFetchedTokenId = useRef<bigint | undefined>(undefined);
  
  // Determine the correct contract address and ABI based on tokenId
  const contractAddress = isLegacyAuction 
    ? process.env.NEXT_PUBLIC_QRAuction as Address 
    : isV2Auction 
      ? process.env.NEXT_PUBLIC_QRAuctionV2 as Address 
      : isV3Auction 
        ? process.env.NEXT_PUBLIC_QRAuctionV3 as Address 
        : process.env.NEXT_PUBLIC_QRAuctionV3 as Address; // Default to V3 for any new auctions
  
  const contractAbi = isLegacyAuction 
    ? QRAuction.abi 
    : isV2Auction 
      ? QRAuctionV2.abi 
      : QRAuctionV3.abi;

  // Use optimized enabled flag to prevent unnecessary reads
  const shouldFetch = !!tokenId && tokenId !== lastFetchedTokenId.current;

  if (process.env.NODE_ENV === "development") {
    console.log(`Using contract for auction #${tokenId}: ${contractAddress}, version: ${
      isLegacyAuction ? 'V1' : isV2Auction ? 'V2' : 'V3'
    }`);
  }
  
  const { data: auctionDetails, refetch, error: contractReadError } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "auction",
    args: [],
    config: wagmiConfig,
    query: {
      enabled: shouldFetch,
      gcTime: 60000, // Keep data in cache for 1 minute
    }
  });

  // Log any contract read errors
  useEffect(() => {
    if (contractReadError) {
      console.error("Contract read error:", contractReadError);
    }
  }, [contractReadError]);

  // Check cache first for quick navigation
  useEffect(() => {
    if (!tokenId) return;
    
    // Create unique key for cache
    const cacheKey = `${tokenId}-${contractAddress}`;
    
    // Check if we have cached data for this auction
    if (auctionCache.has(cacheKey)) {
      console.log(`Using cached data for auction #${tokenId}`);
      setAuctiondetails(auctionCache.get(cacheKey));
    }
  }, [tokenId, contractAddress]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!tokenId) return;
      
      // Create unique key for cache
      const cacheKey = `${tokenId}-${contractAddress}`;
      
      // Skip if we're already on this token ID
      if (tokenId === lastFetchedTokenId.current && auctionDetail) {
        return;
      }
      
      console.log(`Fetching auction details for token #${tokenId} from contract ${contractAddress}`);
      
      try {
        // If we need fresh data, refetch
        const result = await refetch();
        
        if (!result.data) {
          console.log(`No auction details returned for #${tokenId}`);
          return;
        }
        
        // Assert that auctionDetails is of the expected type
        const details = result.data as AuctionResponse;
        const bidderAddress = details[2];
        
        console.log(`Auction data for #${tokenId}:`, {
          tokenId: details[0].toString(),
          highestBid: details[1].toString(),
          highestBidder: bidderAddress,
          startTime: details[3].toString(),
          endTime: details[4].toString(),
          settled: details[5]
        });

        // Start with basic auction data
        const auctionData: Auction = {
          tokenId: details[0],
          highestBid: details[1],
          highestBidder: bidderAddress,
          startTime: details[3],
          endTime: details[4],
          settled: details[5],
          qrMetadata: details[6],
        };
        
        // Set the auction data immediately without name
        setAuctiondetails(auctionData);
        
        // Cache the data
        auctionCache.set(cacheKey, auctionData);
        
        // Track that we've fetched this token ID
        lastFetchedTokenId.current = tokenId;
        
        // Fetch name asynchronously for display purposes
        try {
          const name = await getName({
            address: bidderAddress as Address,
            chain: base,
          });

          // Update with name
          const updatedData = {
            ...auctionData,
            highestBidderName: name || undefined
          };
          
          setAuctiondetails(updatedData);
          auctionCache.set(cacheKey, updatedData);
        } catch (nameError) {
          console.error("Error fetching name:", nameError);
        }
      } catch (error) {
        console.error("Error fetching auction details:", error);
      }
    };

    fetchDetails();
  }, [refetch, auctionDetails, tokenId, contractAddress, auctionDetail]);

  // Force refetch function that bypasses the cache
  const forceRefetch = useCallback(async () => {
    if (!tokenId) return undefined;
    
    console.log(`Force refetching auction #${tokenId} data, bypassing cache`);
    
    // Clear cache for this auction
    const cacheKey = `${tokenId}-${contractAddress}`;
    auctionCache.delete(cacheKey);
    
    // Reset the last fetched token ID to force a new fetch
    lastFetchedTokenId.current = undefined;
    
    // Perform a fresh fetch
    return await refetch();
  }, [tokenId, contractAddress, refetch]);

  return { refetch, forceRefetch, auctionDetail, contractReadError };
}
