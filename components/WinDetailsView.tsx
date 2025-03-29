/* eslint-disable @next/next/no-img-element */
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
import { formatQRAmount, formatUsdValue } from "@/utils/formatters";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { getFarcasterUser } from "@/utils/farcaster";
import { useBaseColors } from "@/hooks/useBaseColors";
import useEthPrice from "@/hooks/useEthPrice";

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
  openDialog: (url: string) => boolean;
  openBids: () => void;
};

export function WinDetailsView(winnerdata: AuctionType) {
  const isBaseColors = useBaseColors();
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [nameInfo, setNameInfo] = useState<{ pfpUrl?: string; displayName: string; farcasterUsername?: string }>({
    displayName: `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`,
  });

  const { priceUsd: qrPrice } = useTokenPrice();
  const { ethPrice } = useEthPrice();

  // Calculate QR token balance and USD value instead of ETH
  const qrTokenAmount = Number(formatEther(winnerdata.amount));
  const usdBalance = qrPrice ? qrTokenAmount * qrPrice : 0;
  
  // Check if tokenId is between 1-22 to determine if we show ETH or QR
  const isLegacyAuction = winnerdata.tokenId <= 22n;
  const currentEthPrice = ethPrice?.ethereum?.usd || 0;
  const ethBalance = isLegacyAuction ? qrTokenAmount * currentEthPrice : 0;

  useEffect(() => {
    const fetchData = async () => {
      const name = await getName({
        address: winnerdata.winner as Address,
        chain: base,
      });

      // Fetch Farcaster data
      const farcasterUser = await getFarcasterUser(winnerdata.winner);
      
      // Quick temp fix - replace !217978 with softwarecurator
      const fixedName = name === "!217978" ? "softwarecurator" : name;
      const fixedUsername = farcasterUser?.username === "!217978" ? "softwarecurator" : farcasterUser?.username;
      
      setNameInfo({
        displayName: fixedName || `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`,
        pfpUrl: farcasterUser?.pfpUrl,
        farcasterUsername: fixedUsername
      });
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerdata.tokenId]);

  useEffect(() => {
    async function fetchOgImage() {
      try {
        // Map of auction IDs to custom image URLs
        const auctionImageOverrides: Record<string, string> = {
          "1": "https://i.imgur.com/aZfUcoo.png",
          "4": "https://i.imgur.com/DkzUJvK.png",
          "5": "https://i.imgur.com/3KoEvNG.png",
          "7": "https://i.imgur.com/fzojQUs.png",
          "9": "https://i.imgur.com/Ryd5FD6.png",
          "13": "https://i.imgur.com/RcjPf8D.png",
          "14": "https://i.imgur.com/4KcwIzj.png",
          "15": "https://i.imgur.com/jyo2f0H.jpeg",
          "20": "https://i.imgur.com/8qNqYIV.png",
          "22": "https://i.imgur.com/21yjB2x.png",
          "23": "https://i.imgur.com/5gCWL3S.png",
          "24": "https://i.imgur.com/Q5UspzS.png"
        };

        // Check if we have a custom image override for this auction
        const tokenIdStr = winnerdata.tokenId.toString();
        if (auctionImageOverrides[tokenIdStr]) {
          setOgImage(auctionImageOverrides[tokenIdStr]);
          return;
        }
        
        const res = await fetch(`/api/og?url=${winnerdata.url}`);
        const data = await res.json();
        console.log(data);
        if (data.error) {
          setOgImage(
            `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
          );
        } else {
          if (data.image !== "") {
            setOgImage(data.image);
          } else {
            setOgImage(
              `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
            );
          }
        }
      } catch (err) {
      } finally {
      }
    }
    fetchOgImage();
  }, [winnerdata.url, winnerdata.tokenId]);

  return (
    <>
      <div className="flex flex-row justify-between items-start gap-1">
        <div className="">
          <div className="flex flex-row gap-2">
            <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Winning bid</div>
            <button
              onClick={winnerdata.openBids}
              className={`${isBaseColors ? "text-foreground underline" : "text-gray-600 dark:text-[#696969] underline"} text-left`}
            >
              see bids
            </button>
          </div>
          <div className="inline-flex flex-row justify-center items-center gap-1">
            <div className="text-xl font-bold">
              {formatQRAmount(Number(formatEther(winnerdata?.amount || 0n)))} {isLegacyAuction ? 'ETH' : '$QR'} {
                isLegacyAuction 
                  ? ethBalance > 0 ? `($${ethBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''
                  : qrPrice ? `(${formatUsdValue(usdBalance)})` : ''
              }
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end" style={{ minWidth: '160px', maxWidth: '200px' }}>
          <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} w-full text-right mb-1`}>Won by</div>
          <div className="flex justify-end items-center w-full">
            {nameInfo.pfpUrl ? (
              <img 
                src={nameInfo.pfpUrl} 
                alt="Profile" 
                className="w-6 h-6 rounded-full object-cover mr-1 flex-shrink-0"
              />
            ) : (
              <div className="mr-2 flex-shrink-0">
                <RandomColorAvatar />
              </div>
            )}
            
            {nameInfo.farcasterUsername ? (
              <div className="flex items-center overflow-hidden">
                <div className="text-right whitespace-nowrap text-ellipsis overflow-hidden max-w-[170px]">
                  @{nameInfo.farcasterUsername}
                </div>
                <WarpcastLogo 
                  size="md" 
                  username={nameInfo.farcasterUsername} 
                  className="ml-1 flex-shrink-0"
                />
              </div>
            ) : (
              <span className="truncate max-w-[170px] text-right">
                {nameInfo.displayName}
              </span>
            )}
          </div>
        </div>
      </div>

      {winnerdata.url !== "" && winnerdata.url !== "0x" && (
        <div className={`${isBaseColors ? "bg-background" : "bg-green-50 border border-green-100"} flex flex-col mt-6 p-3 rounded-md h-full md:h-[236px]`}>
          <div className="inline-flex flex-row justify-between items-center w-full">
            <div className="text-sm">
              <span className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Winner: </span>
              <SafeExternalLink
                href={winnerdata.url}
                className={`${isBaseColors ? "text-foreground" : "text-gray-700 hover:text-gray-900"} transition-colors inline-flex items-center`}
                onBeforeNavigate={() => false}
              >
                {formatURL(winnerdata.url, true)}
                <ExternalLink className="ml-1 h-3 w-3" />
              </SafeExternalLink>
            </div>
          </div>
          <div className={`${isBaseColors ? "bg-background" : "bg-white"} flex flex-col rounded-md justify-center items-center h-full mt-1 w-full overflow-hidden aspect-[2/1]`}>
            {ogImage && (
              <img
                src={ogImage}
                alt="Open Graph"
                className="h-auto w-full"
                onClick={() => {
                  window.location.href = winnerdata.url;
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
