/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useReducer, useCallback } from "react";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import { useWatchContractEvent, useClient } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import { config } from "../config/config";
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

export function useFetchAuctions() {
  const initialState: AuctionState = { auctions: [], historicalLoaded: false };
  const [state, dispatch] = useReducer(auctionReducer, initialState);

  const client = useClient({ config });

  // Create a fetchHistoricalAuctions function that we can re-use
  const fetchHistoricalAuctions = useCallback(async () => {
    if (!client) return;
    
    try {
      const provider = clientToProvider(client);
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_QRAuction as string,
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
  }, [client]);

  // Fetch historical events and initialize state on mount
  useEffect(() => {
    fetchHistoricalAuctions();
  }, [fetchHistoricalAuctions]);

  // Listen for new events and update state
  useWatchContractEvent({
    address: process.env.NEXT_PUBLIC_QRAuction as Address,
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
    config,
  });

  return { 
    auctions: state.auctions,
    refetch: fetchHistoricalAuctions 
  };
}
