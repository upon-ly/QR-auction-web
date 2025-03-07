"use client";
import { formatEther } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState } from "react";
// import { Button } from "@/components/ui/button";
import { RandomColorAvatar } from "./RandomAvatar";
import { SafeExternalLink } from "./SafeExternalLink";
import { ExternalLink } from "lucide-react";
import { getDisplayUrl, truncateUrl } from "@/utils/helperFunctions";

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

  useEffect(() => {
    const fetch = async () => {
      const name = await getName({
        address: winnerdata.winner as Address,
        chain: base,
      });

      setENSname(
        name ||
          `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`
      );
    };

    fetch();
  }, [winnerdata]);

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <div className="text-gray-600">Winning bid</div>
          <div className="text-xl md:text-2xl font-bold">
            {formatEther(winnerdata?.amount || 0n)} ETH
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
              {getDisplayUrl(truncateUrl(winnerdata.url))}
              <ExternalLink className="ml-1 h-3 w-3" />
            </SafeExternalLink>
          </div>
        </div>
      )}
    </>
  );
}
