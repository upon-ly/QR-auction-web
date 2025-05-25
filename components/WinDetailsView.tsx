/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { formatEther, formatUnits } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState, useMemo, useRef } from "react";
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
import { getAuctionVersion } from "@/utils/auctionPriceData";
import { useWinnerData } from "@/hooks/useWinnerData";
import { frameSdk } from "@/lib/frame-sdk";
import { useAuctionImage } from "@/hooks/useAuctionImage";


type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
  openDialog: (url: string) => boolean;
  openBids: () => void;
  isFrame?: boolean;
};

export function WinDetailsView(winnerdata: AuctionType) {
  const isBaseColors = useBaseColors();
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [nameInfo, setNameInfo] = useState<{ pfpUrl?: string; displayName: string; farcasterUsername?: string }>({
    displayName: `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`,
  });
  
  // Use the new TanStack Query hook to fetch and cache winner data
  const { 
    data: winnerDbData, 
    isLoading: isWinnerDataLoading, 
    isError: isWinnerDataError 
  } = useWinnerData(winnerdata.tokenId);
  
  // Use the auction image hook to get override images
  const { data: auctionImageData } = useAuctionImage(winnerdata.tokenId.toString());
  
  // Determine auction version
  const auctionVersion = useMemo(() => getAuctionVersion(winnerdata.tokenId), [winnerdata.tokenId]);
  
  // Initialize isFrame from props or determine via useRef
  const isFrame = useRef(!!winnerdata.isFrame);

  const { priceUsd: qrPrice } = useTokenPrice();
  const { ethPrice } = useEthPrice();

  // Determine auction version
  const isV1Auction = auctionVersion === "v1";
  const isV2Auction = auctionVersion === "v2";
  const isV3Auction = auctionVersion === "v3";
  
  // Calculate token amount from blockchain data
  const tokenAmount = useMemo(() => {
    if (isV3Auction) {
      return Number(formatUnits(winnerdata.amount, 6)); // USDC has 6 decimals
    }
    return Number(formatEther(winnerdata.amount)); // ETH and QR have 18 decimals
  }, [winnerdata.amount, isV3Auction]);

  // Check if we're in Farcaster frame context if not passed in props
  useEffect(() => {
    if (winnerdata.isFrame !== undefined) {
      isFrame.current = winnerdata.isFrame;
      return;
    }
    
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrame.current = !!context?.user;
        console.log("Frame context check in WinDetailsView:", isFrame.current ? "Running in frame" : "Not in frame");
      } catch (frameError) {
        console.log("Not in a Farcaster frame context:", frameError);
        isFrame.current = false;
      }
    }
    
    checkFrameContext();
  }, [winnerdata.isFrame]);

  // Handle URL opening, prioritizing Frame SDK when in frame environment
  const handleOpenUrl = async (url: string) => {
    // For frame environments, use the Frame SDK
    if (isFrame.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
        // Fallback to regular navigation
        window.open(url, "_blank");
      }
      return;
    }
    
    // For non-frame environments, open directly without safety dialog
    window.open(url, "_blank");
  };

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
        // Check if we have an auction image override
        if (auctionImageData?.imageUrl) {
          setOgImage(auctionImageData.imageUrl);
          setIsVideo(auctionImageData.isVideo);
          return;
        }

        // If no override exists, fetch from OG API
        const res = await fetch(`/api/og?url=${winnerdata.url}`);
        const data = await res.json();
        console.log(data);
        if (data.error) {
          setOgImage(
            `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
          );
          setIsVideo(false);
        } else {
          if (data.image !== "") {
            setOgImage(data.image);
            setIsVideo(false); // OG images are not videos
          } else {
            setOgImage(
              `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
            );
            setIsVideo(false);
          }
        }
      } catch (err) {
      } finally {
      }
    }
    fetchOgImage();
  }, [winnerdata.url, winnerdata.tokenId, auctionImageData]);

  // Helper function to format bid amount based on auction type
  const formatBidAmount = () => {
    if (isV3Auction) {
      // For V3, show USDC format
      return `$${tokenAmount.toFixed(2)}`;
    } else if (isV1Auction) {
      return `${formatQRAmount(tokenAmount)} ETH`;
    } else {
      return `${formatQRAmount(tokenAmount)} $QR`;
    }
  };

  // Helper function to format value in USD
  const formatUsdValueDisplay = (): string => {
    // Don't show USD value for V3 auctions since amount is already in USD
    if (isV3Auction) {
      return '';
    }
    
    // If we're still loading data, don't show anything yet
    if (isWinnerDataLoading) {
      return '';
    }
    
    // If we have database value, use it
    if (winnerDbData?.usd_value) {
      return `($${winnerDbData.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } 
    
    // If we tried to load but there's no data, fall back to current prices
    if (isV1Auction && ethPrice?.ethereum?.usd) {
      const currentUsdValue = tokenAmount * ethPrice.ethereum.usd;
      return `($${currentUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } else if (isV2Auction && qrPrice) {
      const currentUsdValue = tokenAmount * qrPrice;
      return `(${formatUsdValue(currentUsdValue)})`;
    }
    
    return '';
  };

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
              {formatBidAmount()}
              {!isV3Auction && (
                <span className="ml-1">{formatUsdValueDisplay()}</span>
              )}
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
            <div className="text-sm w-full overflow-hidden">
              <span className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Winner: </span>
              <button
                onClick={() => handleOpenUrl(winnerdata.url)}
                className={`${isBaseColors ? "text-foreground" : "text-gray-700 hover:text-gray-900"} transition-colors inline-flex items-center max-w-[calc(100%-65px)]`}
              >
                <span className="truncate inline-block align-middle">
                  {formatURL(winnerdata.url, true, true, 280)}
                </span>
                <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
              </button>
            </div>
          </div>
          <div className={`${isBaseColors ? "bg-background" : "bg-white"} flex rounded-md h-full mt-1 w-full overflow-hidden aspect-[2/1]`}>
            {ogImage && isVideo ? (
              <video
                src={ogImage}
                poster="https://i.postimg.cc/85DwR5m5/74winner.jpg"
                controls
                autoPlay
                
                playsInline
                loop
                onClick={() => handleOpenUrl(winnerdata.url)}
                className="h-full w-full object-cover cursor-pointer"
              />
            ) : ogImage && (
              <img
                src={ogImage}
                alt="Open Graph"
                className="h-full w-full object-cover cursor-pointer" 
                onClick={() => handleOpenUrl(winnerdata.url)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
