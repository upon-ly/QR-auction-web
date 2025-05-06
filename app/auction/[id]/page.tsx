/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuctionNavigation } from "@/components/auction-navigation";
import { QRPage } from "@/components/QRPage";
import { AuctionDetails } from "@/components/auction-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useFetchAuctions } from "@/hooks/useFetchAuctions";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { toast } from "sonner";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "@/components/SafetyDialog";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import { useFetchAuctionSettings } from "@/hooks/useFetchAuctionSettings";
import { useAuctionEvents } from "@/hooks/useAuctionEvents";
import { Button } from "@/components/ui/button";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";
import { WinnerAnnouncement } from "@/components/WinnerAnnouncement";
import { UniswapWidget } from "@/components/ui/uniswap-widget";
import Link from "next/link";
import { formatURL } from "@/utils/helperFunctions";
import BidStats from "@/components/BidStats";
import { EndorsementsCarousel } from "@/components/EndorsementsCarousel";
import styles from "./AuctionPageDesktopText.module.css";
import { frameSdk } from "@/lib/frame-sdk";

// Key for storing the latest auction ID in localStorage
const LATEST_AUCTION_KEY = 'qrcoin_latest_auction_id';

// Helper function to safely access localStorage
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Error accessing localStorage:', e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Error setting localStorage:', e);
    }
  }
};

interface SettingsResponse {
  data: Array<{
    urlString: string;
  }>;
}

const EARLIEST_AUCTION_ID = 1;

export default function AuctionPage() {
  const params = useParams();
  const router = useRouter();
  const currentAuctionId = Number(params.id);

  const [mounted, setMounted] = useState(false);
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogUrl, setOgUrl] = useState<string>(
    `${String(process.env.NEXT_PUBLIC_DEFAULT_REDIRECT)}`
  );
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLatestAuction, setIsLatestAuction] = useState(false);
  const [latestAuctionId, setLatestAuctionId] = useState(0);
  const isFrame = useRef(false);

  const isBaseColors = useBaseColors();
  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } = useSafetyDialog();
  const { auctions, refetch: refetchAuctions, forceRefetch: forceRefetchAuctions } = useFetchAuctions(BigInt(currentAuctionId));
  const { refetchSettings } = useFetchAuctionSettings(BigInt(currentAuctionId));

  // Check if this is auction #22 from v1 contract
  const isAuction22 = currentAuctionId === 22;
  
  // Check if this is auction #61 from v2 contract
  const isAuction61 = currentAuctionId === 61;

  // Check if we're in Farcaster frame context on mount
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrame.current = !!context?.user;
        console.log("Frame context check in AuctionPage:", isFrame.current ? "Running in frame" : "Not in frame");
      } catch (frameError) {
        console.log("Not in a Farcaster frame context:", frameError);
        isFrame.current = false;
      }
    }
    
    checkFrameContext();
  }, []);
  
  // Function to handle URL opening specifically for Frame environments
  const handleFrameOpenUrl = async (url: string) => {
    if (isFrame.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
        // Fallback to regular navigation
        window.open(url, "_blank");
      }
    } else {
      // For non-frame environments, use the safety dialog or normal navigation
      if (openDialog(url)) {
        return; // Safety dialog is handling it
      }
      window.open(url, "_blank");
    }
  };

  // Update the cached latest auction ID whenever we have auctions data
  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      setLatestAuctionId(latestId);
      setIsLatestAuction(currentAuctionId === latestId);
      setIsLoading(false);
      
      // Update the cached latest auction ID if this is indeed the latest
      if (latestId > 0) {
        safeLocalStorage.setItem(LATEST_AUCTION_KEY, latestId.toString());
      }
    } else if (auctions) {
      setIsLoading(false);
    }
  }, [auctions, currentAuctionId]);

  const fetchOgImage = useCallback(async () => {
    try {
      const res = await refetchSettings() as SettingsResponse;
      const url = res?.data[6]?.urlString ?? `${process.env.NEXT_PUBLIC_DEFAULT_REDIRECT}`;

      try {
        const ogRes = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
        const data = await ogRes.json();
        if (data.error || !data.image) {
          setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        } else {
          setOgImage(data.image);
        }
        setOgUrl(url);
      } catch (err) {
        setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        setOgUrl(url);
      }
    } catch (err) {
      console.error("Error fetching OG image:", err);
    }
  }, [refetchSettings]);

  useEffect(() => {
    if (isLatestAuction) {
      fetchOgImage();
    } else {
      setOgImage(null);
      setOgUrl('');
    }
  }, [isLatestAuction, fetchOgImage]);

  const handlePrevious = () => {
    if (currentAuctionId > EARLIEST_AUCTION_ID) {
      router.push(`/auction/${currentAuctionId - 1}`);
    }
  };

  const handleNext = () => {
    if (!isLatestAuction || currentAuctionId === 22 || currentAuctionId === 61) {
      router.push(`/auction/${currentAuctionId + 1}`);
    }
  };

  const handleLatest = () => {
    if (latestAuctionId > 0) {
      router.push(`/auction/${latestAuctionId}`);
    } else {
      console.warn("Latest auction ID not available yet.");
    }
  };

  useAuctionEvents({
    tokenId: BigInt(currentAuctionId),
    onAuctionBid: (tokenId, bidder, amount, extended, endTime, urlString, name) => {
      if (Number(tokenId) === currentAuctionId) {
        // Force refresh the auction data to bypass cache
        forceRefetchAuctions();
      }
    },
    onAuctionSettled: (tokenId, winner, amount, urlString, name) => {
      forceRefetchAuctions();
      if (Number(tokenId) === latestAuctionId && isLatestAuction) {
        fetchOgImage();
      }
    },
    onAuctionCreated: (tokenId) => {
      forceRefetchAuctions().then(() => {
        const newLatestId = Number(tokenId);
        
        // Update the cached latest auction ID when a new auction is created
        safeLocalStorage.setItem(LATEST_AUCTION_KEY, newLatestId.toString());
        
        if (isLatestAuction || currentAuctionId === newLatestId - 1) {
          router.push(`/auction/${newLatestId}`);
        }
        fetchOgImage();
      });
    },
  });

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };

  const auctionImageOverrides = useMemo<Record<number, string>>(
    () => ({
        2: "https://i.imgur.com/aZfUcoo.png",
        5: "https://i.imgur.com/DkzUJvK.png",
        6: "https://i.imgur.com/3KoEvNG.png",
        8: "https://i.imgur.com/fzojQUs.png",
        10: "https://i.imgur.com/Ryd5FD6.png",
        14: "https://i.imgur.com/RcjPf8D.png",
        15: "https://i.imgur.com/4KcwIzj.png",
        16: "https://i.imgur.com/jyo2f0H.jpeg",
        21: "https://i.imgur.com/8qNqYIV.png",
        23: "https://i.imgur.com/21yjB2x.png",
        24: "https://i.imgur.com/5gCWL3S.png",
        25: "https://i.imgur.com/Q5UspzS.png",
        26: "https://i.imgur.com/no5pC8v.png",
        28: "https://i.postimg.cc/2SgbbqFr/qr-27-winner.png",
        30: "https://i.postimg.cc/zDg3CxBW/elon5050.png",
        31: "https://i.postimg.cc/tRkFGkKL/Group-424.png",
        33: "https://i.postimg.cc/tRkFGkKL/Group-424.png",
        34: "https://i.postimg.cc/mhWtNxTw/34winner.png",
        35: "https://i.postimg.cc/wBfV58jL/35winner.png",
        38: "https://i.postimg.cc/RZfJ9hsX/winner37.jpg",
        40: "https://i.postimg.cc/rpxzhzbX/winner39.png",
        43: "https://i.postimg.cc/bwGJ6JKy/42winner.jpg",
        44: "https://i.postimg.cc/wTDHNwnp/43winner.jpg",
        46: "https://i.postimg.cc/DzRKLWrW/45winner.jpg",
        47: "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWNvYms5bXdremd6MjF4aTR0ZW4zYjB0NmlobWk1dzk1aGRlb3VzYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/RFEiTqRUBaKHLpO8Lv/giphy.gif",
        48: "https://i.postimg.cc/RFDdTkkr/47winner.jpg",
        49: "https://i.postimg.cc/zBwNND8N/48winner.jpg",
        56: "https://i.postimg.cc/NfXMQDtR/55winner.jpg",
        57: "https://i.postimg.cc/NfXMQDtR/55winner.jpg",
        58: "https://i.postimg.cc/GhFSqpM7/57winner.jpg",
        60: "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExYW1rY216bmtidnAwcDgzcHYwdTNmYTB2dDhnM3BxbW43cDZ5bmV3MiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZmCWjB3utyyAN61pAj/giphy.gif",
        61: "https://i.ibb.co/JWWcQyJ4/60winner.jpg"
    }),
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto mt-3 md:mt-0 lg:mt-0">
        <div className="md:hidden text-center w-full mb-1">
            <p className="font-bold text-md md:text-xl">SAME QR. NEW WEBSITE. EVERY DAY.</p>
            <p className="text-sm md:text-base">Win the auction to choose where it points next!</p>
        </div>
        <div className="flex flex-col justify-center items-center gap-9">

          <div className="grid md:grid-cols-2 gap-2 md:gap-8 w-full">
            <div
              className={clsx(
                "flex flex-col justify-center px-8 pb-6 pt-6 md:p-8 lg:p-8 h-[220px] md:h-[345px] rounded-lg relative",
                isBaseColors ? "bg-primary" : "bg-white border"
              )}
            >
              {/* Desktop-only: Heading and Subheading for QR card, overlayed */}
              <div className="hidden md:block">
                <div className={styles.desktopHeading}>SAME QR. NEW WEBSITE. EVERY DAY.</div>
                <div className={styles.desktopSubheading}>Win the auction to choose where it points next!</div>
              </div>
              <SafeExternalLink
                href={`${process.env.NEXT_PUBLIC_HOST_URL}/redirect`}
                className={`absolute top-3 right-3 p-1.5 rounded-full z-10 ${
                  isBaseColors 
                    ? "bg-white/20 hover:bg-white/30" 
                    : "bg-gray-100 hover:bg-gray-200"
                } transition-colors`}
                onBeforeNavigate={() => false}
                aria-label="Open redirect link"
              >
                <ExternalLink className={`h-5 w-5 ${isBaseColors ? "text-white" : "text-black"}`} />
              </SafeExternalLink>
              
              <div className="inline-flex flex-col items-center">
                <QRPage />
              </div>
            </div>

            {!isLoading && currentAuctionId > 0 ? (
              <AuctionDetails
                id={currentAuctionId}
                onPrevious={handlePrevious}
                onNext={handleNext}
                isLatest={isLatestAuction}
              />
            ) : (
              <Skeleton className="flex-1 h-[368px]" />
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-8 w-full">
            <div className="flex flex-col w-full">
              {/* Mobile Winner Display - displayed as block on mobile, hidden on desktop */}
              {isLatestAuction && ogImage && !isAuction22 && (
                <div className="block md:hidden">
                  <div className="flex flex-col justify-center items-center w-[calc(100vw-32px)] max-w-[376px] mx-auto gap-1">
                    <label className="font-semibold text-xl md:text-2xl flex items-center justify-center w-full">
                      <span className="md:hidden whitespace-nowrap">🏆🏆🏆🏆</span>
                      <span className="mx-2">Today&apos;s Winner</span>
                      <span className="md:hidden whitespace-nowrap">🏆🏆🏆🏆</span>
                    </label>
                    <div className={clsx(
                      "border rounded-lg shadow-none flex flex-col w-full overflow-hidden",
                      isBaseColors ? "bg-primary/5" : "bg-white dark:bg-black"
                    )}
                    style={{ boxShadow: 'none' }}>
                      {/* Image with no padding */}
                      <div className="w-full bg-white aspect-[2/1] overflow-hidden">
                        <img
                          src={auctionImageOverrides[currentAuctionId] || ogImage || ''}
                          alt="Open Graph"
                          className="object-cover w-full h-full cursor-pointer"
                          onClick={() => {
                            if (ogUrl) handleFrameOpenUrl(ogUrl);
                          }}
                        />
                      </div>
                      {/* Text content with padding */}
                      <div className="flex flex-col items-center p-4">
                        <span className={clsx(isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]", "font-normal")}>
                          The QR now points to:
                        </span>
                        <div className="w-full flex justify-center">
                          <button
                            onClick={() => handleFrameOpenUrl(ogUrl)}
                            className="inline-flex items-center hover:opacity-80 transition-opacity max-w-full"
                            title={ogUrl}
                            aria-label="redirect"
                          >
                            <span className="truncate font-medium">
                              {formatURL(ogUrl, true, true, 280)}
                            </span>
                            <ExternalLink className="ml-1 h-6 w-3.5 flex-shrink-0" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Desktop Winner Display - hidden on mobile, displayed on desktop */}
              {isLatestAuction && ogImage && !isAuction22 && (
                <div className="hidden md:flex flex-col justify-center items-center gap-1 w-full max-w-[376px] mx-auto">
                  <label className="font-semibold text-xl md:text-2xl flex items-center justify-center w-full">
                    <span className="hidden md:inline">🏆</span>
                    <span className="mx-2">Today&apos;s Winner</span>
                    <span className="hidden md:inline">🏆</span>
                  </label>
                  <div className={clsx(
                    "border rounded-lg shadow-none flex flex-col w-full overflow-hidden",
                    isBaseColors ? "bg-primary/5" : "bg-white dark:bg-black"
                  )}
                  style={{ boxShadow: 'none' }}>
                    {/* Image with no padding */}
                    <div className="w-full bg-white aspect-[2/1] overflow-hidden">
                      <img
                        src={auctionImageOverrides[currentAuctionId] || ogImage || ''}
                        alt="Open Graph"
                        className="object-cover w-full h-full cursor-pointer"
                        onClick={() => {
                          if (ogUrl) handleFrameOpenUrl(ogUrl);
                        }}
                      />
                    </div>
                    {/* Text content with padding */}
                    <div className="flex flex-col items-center p-4">
                      <span className={clsx(isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]", "font-normal")}>
                        The QR now points to:
                      </span>
                      <div className="w-full flex justify-center">
                        <button
                          onClick={() => handleFrameOpenUrl(ogUrl)}
                          className="inline-flex items-center hover:opacity-80 transition-opacity max-w-full"
                          title={ogUrl}
                          aria-label="redirect"
                        >
                          <span className="truncate font-medium">
                            {formatURL(ogUrl, true, false, 350)}
                          </span>
                          <ExternalLink className="ml-1 h-6 w-3.5 flex-shrink-0" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* BidStats for desktop - under Today's Winner */}
                  <div className="mt-4 w-full max-w-[376px]">
                    <h2 className="font-semibold text-xl md:text-2xl text-center mb-1">
                      <span className="">Bid Counter</span>
                    </h2>
                    <div className="h-[190px]">
                      <BidStats />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:flex flex-col gap-1">
              {isLatestAuction && !isAuction22 && !isAuction61 && (
                <>
                  <h2 className="font-semibold text-xl md:text-2xl text-center">
                    <span className="">Buy USDC</span>
                  </h2>
                  {/* <div style={{ height: "510px" }} className="overflow-hidden rounded-lg w-full mx-auto">
                    <LiFiWidgetComponent 
                      inputCurrency="NATIVE"
                      outputCurrency="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // USDC on Base
                    />
                  </div> */}
                  <div style={{ height: "510px" }}>
                    <UniswapWidget />
                  </div>
                </>
              )}
            </div>
          </div>

          {(!isLatestAuction || isAuction22 || isAuction61) && currentAuctionId > 0 && (
            <WinnerAnnouncement auctionId={currentAuctionId} />
          )}
          
          {/* Mobile LiFi Widget */}
          {/* {isLatestAuction && !isAuction22 && (
            <div className="md:hidden w-full">
              <h2 className="font-semibold text-xl text-center mb-1">
                <span className="">Buy USDC</span>
              </h2>
              <div style={{ height: "570px" }} className="overflow-hidden rounded-lg w-full max-w-[95vw] mx-auto sm:max-w-sm">
                <LiFiWidgetComponent 
                  inputCurrency="NATIVE"
                  outputCurrency="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // USDC on Base
                />
              </div>
            </div>
          )} */}

          {/* Mobile Uniswap Widget */}
          {/* {isLatestAuction && !isAuction22 && !isAuction56 && (
            <div className="md:hidden w-full">
              <h2 className="font-semibold text-xl text-center mb-1">
                <span className="">Buy USDC</span>
              </h2>
              <div style={{ height: "570px" }}>
                <UniswapWidget />
              </div>
            </div>
          )} */}
          
          {/* BidStats for mobile - centered */}
          <div className="md:hidden mx-auto w-full">
            <h2 className="font-semibold text-xl text-center mb-1">
              <span className="">Bid Counter</span>
            </h2>
            <BidStats />
          </div>
        </div>
      </div>

      {/* Love Carousel - add this before the footer */}
      {isLatestAuction && (
        <div className="md:mt-0">
          <EndorsementsCarousel />
        </div>
      )}

      <footer className="lg:mt-10 md:mt-10 mt-10 text-center flex flex-col items-center">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://x.com/QRcoindotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="X (formerly Twitter)"
          >
            <XLogo />
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
          >
            <UniswapLogo />
          </a>
        </div>
        <div
          className="inline-flex items-center text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label
            className={clsx(
              isBaseColors ? "text-foreground" : "",
              "mr-1 cursor-pointer"
            )}
          >
            CA: {contractAddress}
          </label>
          <button
            onClick={copyToClipboard}
            className={clsx(
              isBaseColors
                ? " text-foreground hover:text-primary/90"
                : "hover:bg-gray-100",
              "p-1 rounded-full transition-colors"
            )}
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check
                className={clsx(
                  isBaseColors ? "text-foreground" : "text-green-500",
                  "h-3 w-3"
                )}
              />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
        {(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" &&
          process.env.NODE_ENV === "development") ||
          (process.env.VERCEL_ENV === "preview" && (
            <Link
              href="/debug"
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Debug Panel
            </Link>
          ))}
      </footer>

      <SafetyDialog
        isOpen={isOpen}
        onClose={closeDialog}
        targetUrl={pendingUrl || ""}
        onContinue={handleContinue}
      />
    </main>
  );
} 