/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useReducer, useCallback } from "react";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import { useWatchContractEvent, useClient } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import { wagmiConfig } from "@/config/wagmiConfig";
import { auctionReducer } from "../utils/auctionreducer";
import { Address } from "viem";

export type AuctionType = {
  tokenId: bigint;
  startTime: bigint;
  endTime: bigint;
};

export type AuctionState = {
  auctions: AuctionType[];
  historicalLoaded: boolean;
};

function clientToProvider(client: any) {
  const { chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  if (transport.type === "fallback") {
    const providers = (transport.transports as any[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network)
    );
    return providers.length === 1
      ? providers[0]
      : new FallbackProvider(providers);
  }
  return new JsonRpcProvider(transport.url, network);
}

export function useFetchAuctions(tokenId?: bigint) {
  const initialState: AuctionState = { auctions: [], historicalLoaded: false };
  const [state, dispatch] = useReducer(auctionReducer, initialState);
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 35n;
  const isV3Auction = tokenId && tokenId >= 36n;

  const client = useClient({ config: wagmiConfig });

  // Determine the correct contract address based on tokenId
  const getContractAddress = useCallback(() => {
    if (isLegacyAuction) {
      return process.env.NEXT_PUBLIC_QRAuction as string;
    } else if (isV2Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV2 as string;
    } else if (isV3Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    } else {
      // Default to V3 contract
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    }
  }, [isLegacyAuction, isV2Auction, isV3Auction]);

  // Create a fetchHistoricalAuctions function that we can re-use
  const fetchHistoricalAuctions = useCallback(async () => {
    if (!client) return;
    
    try {
      const provider = clientToProvider(client);
      const contractAddress = getContractAddress();
      const contract = new ethers.Contract(
        contractAddress,
        QRAuction.abi,
        provider
      );
      const filter = contract.filters.AuctionCreated();
      const historicalEvents = await contract.queryFilter(
        filter,
        0,
        "latest"
      );

      const formatted: AuctionType[] = historicalEvents.map((event) => {
        let tokenId: bigint = 0n;
        let startTime: bigint = 0n;
        let endTime: bigint = 0n;
        if ("args" in event && event.args && event.args[0] !== undefined) {
          tokenId = event.args[0];
        }
        if ("args" in event && event.args && event.args[1] !== undefined) {
          startTime = event.args[1];
        }
        if ("args" in event && event.args && event.args[2] !== undefined) {
          endTime = event.args[2];
        }
        return { tokenId, startTime, endTime };
      });

      // Dispatch initialization action
      dispatch({ type: "INITIALIZE", auctions: formatted });
    } catch (error) {
      console.error("Error fetching historical auctions:", error);
    }
  }, [client, getContractAddress]);

  // Fetch historical events and initialize state on mount
  useEffect(() => {
    fetchHistoricalAuctions();
  }, [fetchHistoricalAuctions]);

  // Listen for new events and update state
  useWatchContractEvent({
    address: getContractAddress() as Address,
    abi: QRAuction.abi,
    eventName: "AuctionCreated",
    onLogs(logs) {
      logs.forEach((log) => {
        let tokenId: bigint = 0n;
        let startTime: bigint = 0n;
        let endTime: bigint = 0n;

        if ("args" in log && log.args) {
          // Ensure you're using the correct property names from your ABI
          const args = log.args as
            | {
                tokenId?: bigint;
                startTime?: bigint;
                endTime?: bigint;
              }
            | undefined;

          tokenId = args?.tokenId ?? 0n;
          startTime = args?.startTime ?? 0n;
          endTime = args?.endTime ?? 0n;
        }

        const newEvent: AuctionType = {
          tokenId,
          startTime,
          endTime,
        };

        console.log(newEvent);

        dispatch({ type: "ADD_EVENT", auction: newEvent });
      });
    },
    config: wagmiConfig,
  });

  return { 
    auctions: state.auctions,
    refetch: fetchHistoricalAuctions,
    forceRefetch: async () => {
      console.log('Force refetching auctions list, bypassing cache');
      return await fetchHistoricalAuctions();
    }
  };
}
