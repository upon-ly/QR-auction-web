/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { formatEther } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState } from "react";
import { RandomColorAvatar } from "./RandomAvatar";
import { SafeExternalLink } from "./SafeExternalLink";
import { ExternalLink } from "lucide-react";
import { formatURL } from "@/utils/helperFunctions";
import useEthPrice from "@/hooks/useEthPrice";

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
  openDialog: (url: string) => boolean;
};

export function WinDetailsView(winnerdata: AuctionType) {
  const [ensName, setENSname] = useState<string>(
    `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`
  );

  const {
    ethPrice: price,
    isLoading: isPriceLoading,
    isError: isPriceError,
  } = useEthPrice();

  // Parse the ETH balance and the current price
  const ethBalance = Number(formatEther(winnerdata.amount));
  const ethPrice = price?.ethereum?.usd ?? 0;
  const usdBalance = ethBalance * ethPrice;

  useEffect(() => {
    const fetchData = async () => {
      const name = await getName({
        address: winnerdata.winner as Address,
        chain: base,
      });

      setENSname(
        name ||
          `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`
      );
    };
    fetchData();
  }, [winnerdata]);

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <div className="text-gray-600">Winning bid</div>
          <div className="inline-flex flex-row justify-center items-center gap-1">
            <div className="text-xl font-bold">
              {formatEther(winnerdata?.amount || 0n)} ETH
            </div>
            <div className="text-xl md:text-md font-medium text-gray-600">
              {usdBalance !== 0 && `($${usdBalance.toFixed(0)})`}
            </div>
          </div>
        </div>
        <div>
          <div className="text-gray-600">Won by</div>
          <div className="flex items-center gap-2">
            <RandomColorAvatar />
            <span>{ensName}</span>
          </div>
        </div>
      </div>

      {/* <Button
        className="w-full h-12 bg-gray-900 hover:bg-gray-800"
        onClick={() => window.open(winnerdata.url)}
      >
        Visit winning site
      </Button> */}

      {winnerdata.url !== "" && winnerdata.url !== "0x" && (
        <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-md">
          <div className="text-sm">
            <span className="text-gray-600">Winning bid website: </span>
            <SafeExternalLink
              href={winnerdata.url}
              className="font-medium text-gray-700 hover:text-gray-900 transition-colors inline-flex items-center"
              onBeforeNavigate={winnerdata.openDialog}
            >
              {formatURL(winnerdata.url)}
              <ExternalLink className="ml-1 h-3 w-3" />
            </SafeExternalLink>
          </div>
        </div>
      )}
    </>
  );
}
