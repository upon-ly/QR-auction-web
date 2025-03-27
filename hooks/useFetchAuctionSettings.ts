"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import { Address } from "viem";
import { config } from "../config/config";
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
};

type AuctionSettingsResponse = [
  treasury: string,
  duration: bigint,
  timeBuffer: bigint,
  minBidIncrement: bigint,
  reservePrice: bigint,
  launched: boolean,
  qrMetadata: QRData
];

export function useFetchAuctionSettings(tokenId?: bigint) {
  const [settingDetail, setSettingdetails] = useState<Settings>();
  const isLegacyAuction = tokenId && tokenId <= 23n;

  const { data: settingDetails, refetch: refetchSettings } = useReadContract({
    address: isLegacyAuction ? process.env.NEXT_PUBLIC_QRAuction as Address : process.env.NEXT_PUBLIC_QRAuctionV2 as Address,
    abi: QRAuction.abi,
    functionName: "settings",
    args: [],
    config,
  });

  useEffect(() => {
    const fetchDetails = async () => {
      await refetchSettings();

      if (settingDetails) {
        const details = settingDetails as AuctionSettingsResponse;

        console.log(details);

        setSettingdetails({
          treasury: details[0],
          duration: details[1],
          timeBuffer: details[2],
          minBidIncrement: details[3],
          reservePrice: details[4],
          launched: details[5],
          qrMetadata: details[6],
        });
      }
    };

    fetchDetails();
  }, [refetchSettings, settingDetails]);

  return { refetchSettings, settingDetail };
}
