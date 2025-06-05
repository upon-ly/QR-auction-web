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

// --- Debug Mode ---
const DEBUG = false;

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
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 61n;
  const isV3Auction = tokenId && tokenId >= 62n;
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
    if (DEBUG) {
      console.log(`Using contract for auction #${tokenId}: ${contractAddress}, version: ${
        isLegacyAuction ? 'V1' : isV2Auction ? 'V2' : 'V3'
      }`);
    }
  }
  
  // Main auction data call
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

  // For V3 auctions, also get the bidder name from the contract
  const { data: bidderNameFromContract } = useReadContract({
    address: isV3Auction ? contractAddress : undefined,
    abi: QRAuctionV3.abi,
    functionName: "getBidderName",
    args: auctionDetail?.highestBidder ? [auctionDetail.highestBidder] : undefined,
    config: wagmiConfig,
    query: {
      enabled: Boolean(isV3Auction && auctionDetail?.highestBidder && auctionDetail.highestBidder !== "0x0000000000000000000000000000000000000000"),
      gcTime: 60000,
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
      if (DEBUG) {
        console.log(`Using cached data for auction #${tokenId}`);
      }
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
      
      if (DEBUG) {
        console.log(`Fetching auction details for token #${tokenId} from contract ${contractAddress}`);
      }
      
      try {
        // If we need fresh data, refetch
        const result = await refetch();
        
        if (!result.data) {
          if (DEBUG) {
            console.log(`No auction details returned for #${tokenId}`);
          }
          return;
        }
        
        // Assert that auctionDetails is of the expected type
        const details = result.data as AuctionResponse;
        const bidderAddress = details[2];
        
        if (DEBUG) {
          console.log(`Auction data for #${tokenId}:`, {
            tokenId: details[0].toString(),
            highestBid: details[1].toString(),
            highestBidder: bidderAddress,
            startTime: details[3].toString(),
            endTime: details[4].toString(),
            settled: details[5]
          });
        }

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
        
        // For V3 auctions, use the contract-stored name if available
        if (isV3Auction && bidderNameFromContract && typeof bidderNameFromContract === 'string' && bidderNameFromContract.trim() !== "") {
          auctionData.highestBidderName = bidderNameFromContract;
          if (DEBUG) {
            console.log(`Using contract-stored name for V3 auction: "${bidderNameFromContract}"`);
          }
        }
        
        // Set the auction data immediately
        setAuctiondetails(auctionData);
        
        // Cache the data
        auctionCache.set(cacheKey, auctionData);
        
        // Track that we've fetched this token ID
        lastFetchedTokenId.current = tokenId;
        
        // For V1/V2 auctions or if V3 doesn't have a contract name, fetch ENS/basename asynchronously
        if (!isV3Auction || !auctionData.highestBidderName) {
        try {
          const name = await getName({
            address: bidderAddress as Address,
            chain: base,
          });

            // Only update if we don't already have a contract name (for V3) or if this is V1/V2
            if (!isV3Auction || !auctionData.highestBidderName) {
          const updatedData = {
            ...auctionData,
                highestBidderName: name || auctionData.highestBidderName
          };
          
          setAuctiondetails(updatedData);
          auctionCache.set(cacheKey, updatedData);
            }
        } catch (nameError) {
          if (DEBUG) {
              console.error("Error fetching ENS/basename:", nameError);
            }
          }
        }
      } catch (error) {
        if (DEBUG) {
          console.error("Error fetching auction details:", error);
        }
      }
    };

    fetchDetails();
  }, [refetch, auctionDetails, tokenId, contractAddress, auctionDetail, isV3Auction, bidderNameFromContract]);

  // Force refetch function that bypasses the cache
  const forceRefetch = useCallback(async () => {
    if (!tokenId) return undefined;
    
    if (DEBUG) {
      console.log(`Force refetching auction #${tokenId} data, bypassing cache`);
    }
    
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
