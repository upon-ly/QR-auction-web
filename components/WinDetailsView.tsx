"use client";
import { formatEther } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RandomColorAvatar } from "./RandomAvatar";

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
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
    console.log(winnerdata.url);

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

      <Button
        className="w-full bg-gray-900 hover:bg-gray-800"
        onClick={() => window.open(winnerdata.url)}
      >
        Visit winning site
      </Button>
    </>
  );
}
