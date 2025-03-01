"use client";
import { formatEther } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
};

export function BidCellView({ bid }: { bid: AuctionType }) {
  const [ensName, setENSname] = useState<string>(
    `${bid.bidder.slice(0, 4)}...${bid.bidder.slice(-4)}`
  );

  function formatURL(url: string) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");
      const path = urlObj.pathname;

      // If there's a path, show first 5 characters + ellipsis
      if (path && path.length > 1) {
        // Check if path exists and is not just "/"
        return `${domain}${path.slice(0, 6)}...`;
      }

      return domain;
    } catch {
      return url;
    }
  }

  useEffect(() => {
    const fetch = async () => {
      const name = await getName({
        address: bid.bidder as Address,
        chain: base,
      });

      setENSname(name || `${bid.bidder.slice(0, 4)}...${bid.bidder.slice(-4)}`);
    };

    fetch();
  }, [bid.bidder]);

  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center space-x-3 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src="/placeholder.svg" alt="User avatar" />
          <AvatarFallback>
            {bid.bidder.slice(1, 3).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium truncate">{ensName}</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={bid.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:underline  truncate flex items-center gap-1"
                >
                  <Link2 className="h-3 w-3" />
                  {formatURL(bid.url)}
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[300px]">
                <p className="break-all">{bid.url}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <p className="font-mono text-sm font-medium whitespace-nowrap ml-4">
        Ξ {formatEther(bid.amount)}
      </p>
    </div>
  );
}
