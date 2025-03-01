"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import { Address } from "viem";
import { config } from "../config/config";
import { useEffect, useState } from "react";
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

export function useFetchAuctionDetails() {
  const [auctionDetail, setAuctiondetails] = useState<Auction>();

  const { data: auctionDetails, refetch } = useReadContract({
    address: process.env.NEXT_PUBLIC_QRAuction as Address,
    abi: QRAuction.abi,
    functionName: "auction",
    args: [],
    config,
  });

  useEffect(() => {
    const fetchDetails = async () => {
      await refetch();

      if (auctionDetails) {
        // Assert that auctionDetails is of the expected type
        const details = auctionDetails as AuctionResponse;
        let bidder = details[2];

        const name = await getName({
          address: bidder as Address,
          chain: base,
        });

        bidder = name || `${bidder.slice(0, 4)}...${bidder.slice(-4)}`;

        setAuctiondetails({
          tokenId: details[0],
          highestBid: details[1],
          highestBidder: bidder,
          startTime: details[3],
          endTime: details[4],
          settled: details[5],
          qrMetadata: details[6],
        });
      }
    };

    fetchDetails();
  }, [refetch, auctionDetails]);

  return { refetch, auctionDetail };
}
