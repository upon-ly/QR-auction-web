"use client";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import QRAuction from "../abi/QRAuction.json";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { useClient } from "wagmi";
import { wagmiConfig } from "@/config/wagmiConfig";
import type { Client, Chain, Transport } from "viem";
import { useRef, useCallback } from "react";

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
};

// Global cache for settled auctions
const settledAuctionsCache = new Map<string, AuctionType[]>();

function clientToProvider(client: Client<Transport, Chain>) {
  const { chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  if (transport.type === "fallback") {
    const providers = (transport.transports as ReturnType<Transport>[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network)
    );
    if (providers.length === 1) return providers[0];
    return new FallbackProvider(providers);
  }
  return new JsonRpcProvider(transport.url, network);
}

export function useFetchSettledAuc(tokenId?: bigint) {
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 35n;
  const isV3Auction = tokenId && tokenId >= 36n;
  const client = useClient({
    config: wagmiConfig,
  });
  
  // Track last fetched auctions
  const lastFetched = useRef<{
    timestamp: number;
    contractAddress: string;
  } | null>(null);

  // Get the correct contract address based on tokenId
  const getContractAddress = useCallback(() => {
    if (isLegacyAuction) {
      return process.env.NEXT_PUBLIC_QRAuction as string;
    } else if (isV2Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV2 as string;
    } else if (isV3Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    } else {
      // Default to V3 contract for any new auctions
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    }
  }, [isLegacyAuction, isV2Auction, isV3Auction]);

  // Get the correct ABI based on tokenId
  const getContractAbi = useCallback(() => {
    if (isLegacyAuction) {
      return QRAuction.abi;
    } else if (isV2Auction) {
      return QRAuctionV2.abi;
    } else if (isV3Auction) {
      return QRAuctionV3.abi;
    } else {
      // Default to V3 ABI for any new auctions
      return QRAuctionV3.abi;
    }
  }, [isLegacyAuction, isV2Auction, isV3Auction]);

  const fetchHistoricalAuctions = useCallback(async () => {
    const contractAddress = getContractAddress();
    const cacheKey = contractAddress;
    
    // Check if we have a recent cache entry (less than 60 seconds old)
    const now = Date.now();
    const cacheTtlMs = 60000; // 60 seconds cache TTL
    
    if (
      lastFetched.current && 
      lastFetched.current.contractAddress === contractAddress && 
      (now - lastFetched.current.timestamp) < cacheTtlMs && 
      settledAuctionsCache.has(cacheKey)
    ) {
      console.log(`Using cached settled auctions for contract ${contractAddress}`);
      return settledAuctionsCache.get(cacheKey);
    }
    
    try {
      console.log(`Fetching settled auctions from contract ${contractAddress}`);
      const provider = clientToProvider(client);
      const contractAbi = getContractAbi();
      
      const contract = new ethers.Contract(
        contractAddress,
        contractAbi,
        provider
      );

      const filter = contract.filters.AuctionSettled();
      const historicalEvents = await contract.queryFilter(filter, 0, "latest");

      const formatted: AuctionType[] = await Promise.all(
        historicalEvents.map(async (event) => {
          // event.args is an array (or object) containing the event parameters.
          // Adjust indices or property names based on your ABI.

          let tokenId: bigint = 0n;
          let winner: string = "0x0000000000";
          let amount: bigint = 0n;
          let url: string = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

          if ("args" in event && event.args && event.args[0]) {
            tokenId = event.args[0];
          }

          if ("args" in event && event.args && event.args[1]) {
            winner = event.args[1];
          }

          if ("args" in event && event.args && event.args[2]) {
            amount = event.args[2];
          }

          if ("args" in event && event.args && event.args[3]) {
            url =
              event.args[3] === "0x"
                ? (process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string)
                : event.args[3];
          }

          return {
            tokenId,
            winner,
            amount,
            url,
          };
        })
      );
      
      // Update cache timestamp
      lastFetched.current = {
        timestamp: now,
        contractAddress
      };
      
      // Save in cache
      settledAuctionsCache.set(cacheKey, formatted);

      return formatted;
    } catch (error) {
      console.log("error catching events: ", error);
    }
  }, [client, getContractAbi, getContractAddress]);

  return { fetchHistoricalAuctions };
}
