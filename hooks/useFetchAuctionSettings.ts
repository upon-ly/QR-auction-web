"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address } from "viem";
import { wagmiConfig } from "@/config/wagmiConfig";
import { useEffect, useState } from "react";

type QRData = {
  validUntil: bigint;
  urlString: string;
};

type Settings = {
  treasury: string;
  duration: bigint;
  timeBuffer: bigint;
  minBidIncrement: bigint;
  reservePrice: bigint;
  launched: boolean;
  qrMetadata: QRData;
  usdcToken?: string;
};

type AuctionSettingsResponse = [
  treasury: string,
  duration: bigint,
  timeBuffer: bigint,
  minBidIncrement: bigint,
  reservePrice: bigint,
  launched: boolean,
  qrMetadata: QRData,
  usdcToken?: string
];

export function useFetchAuctionSettings(tokenId?: bigint) {
  const [settingDetail, setSettingdetails] = useState<Settings>();
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 61n;
  const isV3Auction = tokenId && tokenId >= 62n;

  const contractAddress = isLegacyAuction 
    ? process.env.NEXT_PUBLIC_QRAuction as Address 
    : isV2Auction 
      ? process.env.NEXT_PUBLIC_QRAuctionV2 as Address 
      : process.env.NEXT_PUBLIC_QRAuctionV3 as Address;
  
  const contractAbi = isLegacyAuction 
    ? QRAuction.abi 
    : isV2Auction 
      ? QRAuctionV2.abi 
      : QRAuctionV3.abi;

  console.log(`Settings: Using contract for auction #${tokenId}: ${contractAddress}, version: ${
    isLegacyAuction ? 'V1' : isV2Auction ? 'V2' : 'V3'
  }`);

  const { data: settingDetails, refetch: refetchSettings, error } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "settings",
    args: [],
    config: wagmiConfig,
  });

  useEffect(() => {
    if (error) {
      console.error(`Settings error for auction #${tokenId}:`, error);
    }
  }, [error, tokenId]);

  useEffect(() => {
    const fetchDetails = async () => {
      console.log(`Fetching settings for auction #${tokenId}`);
      try {
        await refetchSettings();

        if (settingDetails) {
          const details = settingDetails as AuctionSettingsResponse;

          console.log(`Settings data for auction #${tokenId}:`, details);

          if (isV3Auction && details.length > 7) {
            setSettingdetails({
              treasury: details[0],
              duration: details[1],
              timeBuffer: details[2],
              minBidIncrement: details[3],
              reservePrice: details[4],
              launched: details[5],
              qrMetadata: details[6],
              usdcToken: details[7]
            });
          } else {
            setSettingdetails({
              treasury: details[0],
              duration: details[1],
              timeBuffer: details[2],
              minBidIncrement: details[3],
              reservePrice: details[4],
              launched: details[5],
              qrMetadata: details[6]
            });
          }
        } else {
          console.log(`No settings data returned for auction #${tokenId}`);
        }
      } catch (fetchError) {
        console.error(`Error fetching settings for auction #${tokenId}:`, fetchError);
      }
    };

    fetchDetails();
  }, [refetchSettings, settingDetails, tokenId, isV3Auction]);

  return { refetchSettings, settingDetail, error };
}
