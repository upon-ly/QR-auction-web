"use client";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import QRAuction from "../abi/QRAuction.json";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { useClient } from "wagmi";
import { wagmiConfig } from "@/config/wagmiConfig";
import type { Client, Chain, Transport } from "viem";
import { v4 as uuidv4 } from "uuid";

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

export function useFetchBids(tokenId?: bigint) {
  const client = useClient({ config: wagmiConfig });
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 61n;
  const isV3Auction = tokenId && tokenId >= 62n;
  
  // Get the correct contract address based on tokenId
  const getContractAddress = () => {
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
  };

  // Get the correct ABI based on tokenId
  const getContractAbi = () => {
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
  };
  
  const fetchHistoricalAuctions = async () => {
    try {
      const provider = clientToProvider(client);
      const contractAddress = getContractAddress();
      const contractAbi = getContractAbi();
      
      const contract = new ethers.Contract(
        contractAddress,
        contractAbi,
        provider
      );

      const filter = contract.filters.AuctionBid();
      const historicalEvents = await contract.queryFilter(filter, 0, "latest");

      const formatted: AuctionType[] = historicalEvents.map((event) => {
        // event.args is an array (or object) containing the event parameters.
        // Adjust indices or property names based on your ABI.

        let tokenId: bigint = 0n;
        let bidder: string = "0x";
        let amount: bigint = 0n;
        let extended: boolean = false;
        let endTime: bigint = 0n;
        let url: string = "";
        let name: string | undefined = undefined;
        const _id: string = uuidv4();

        if ("args" in event && event.args && event.args[0]) {
          tokenId = event.args[0];
        }

        if ("args" in event && event.args && event.args[1]) {
          bidder = event.args[1];
        }

        if ("args" in event && event.args && event.args[2]) {
          amount = event.args[2];
        }

        if ("args" in event && event.args && event.args[3]) {
          extended = event.args[3];
        }

        if ("args" in event && event.args && event.args[4]) {
          endTime = event.args[4];
        }

        if ("args" in event && event.args && event.args[5]) {
          url = event.args[5];
        }

        // For V3 auctions, also read the name field (index 6)
        if ("args" in event && event.args && event.args[6]) {
          // Check if this specific event is from a V3 auction (tokenId >= 62)
          const eventIsV3 = tokenId >= 62n;
          if (eventIsV3) {
            const nameValue = event.args[6];
            if (typeof nameValue === 'string' && nameValue.trim() !== '') {
              name = nameValue;
            }
          }
        }

        return {
          tokenId,
          bidder,
          amount,
          extended,
          endTime,
          url,
          name,
          _id,
        };
      });
      return formatted;
    } catch (error) {
      console.log("error catching events: ", error);
    }
  };

  return { fetchHistoricalAuctions };
}
