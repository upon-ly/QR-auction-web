/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
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
import { ThemeDialog } from "@/components/ThemeDialog";
import { useAuctionEvents } from "@/hooks/useAuctionEvents";
import { Button } from "@/components/ui/button";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";
import { WinnerAnnouncement } from "@/components/WinnerAnnouncement";
import { UniswapWidget } from "@/components/ui/uniswap-widget";
import Link from "next/link";
import { formatURL } from "@/utils/helperFunctions";

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
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [isLatestAuction, setIsLatestAuction] = useState(false);
  const [latestAuctionId, setLatestAuctionId] = useState(0);

  const isBaseColors = useBaseColors();
  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } = useSafetyDialog();
  const { auctions, refetch: refetchAuctions } = useFetchAuctions(BigInt(currentAuctionId));
  const { refetchSettings } = useFetchAuctionSettings(BigInt(currentAuctionId));

  // Check if this is auction #22 from v1 contract
  const isAuction22 = currentAuctionId === 22;

  const handleLogoClick = () => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      if (latestId > 0) {
        router.push(`/`);
      } else {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  };

  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const lastId = Number(lastAuction.tokenId);
      setLatestAuctionId(lastId);
      setIsLatestAuction(currentAuctionId === lastId);
      setIsLoading(false);
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
    if (!isLatestAuction || currentAuctionId === 22) {
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
    onAuctionBid: (tokenId) => {
      if (Number(tokenId) === currentAuctionId) {
        refetchAuctions();
      }
    },
    onAuctionSettled: (tokenId) => {
      refetchAuctions();
      if (Number(tokenId) === latestAuctionId && isLatestAuction) {
        fetchOgImage();
      }
    },
    onAuctionCreated: (tokenId) => {
      refetchAuctions().then(() => {
        const newLatestId = Number(tokenId);
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
        25: "https://i.imgur.com/Q5UspzS.png"
    }),
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8 mt-8 md:mt-4 lg:mt-4">
        <h1
          onClick={handleLogoClick}
          className="text-2xl font-bold cursor-pointer"
        >
          $QR
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
                : ""
            }
            onClick={() => setThemeDialogOpen(true)}
          >
            Theme
          </Button>
          <ConnectButton
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col justify-center items-center gap-9">
          <div className="grid md:grid-cols-2 gap-4 md:gap-8 w-full">
            <div
              className={`${
                isBaseColors ? "bg-primary" : "bg-white"
              } flex flex-col justify-center p-8 h-[280px] md:h-[368px] rounded-lg`}
            >
              <div className="inline-flex flex-col items-center mt-6">
                <QRPage />
                <div className="mt-1">
                  <SafeExternalLink
                    href={`${process.env.NEXT_PUBLIC_HOST_URL}/redirect`}
                    className={`relative inline-flex items-center ${
                      isBaseColors
                        ? "bg-primary text-foreground"
                        : "bg-white text-gray-700"
                    } text-sm font-medium hover:bg-gray-50 transition-colors w-full`}
                    onBeforeNavigate={() => false}
                  >
                    <span className="block w-full text-center">
                      Visit Website{" "}
                    </span>
                    <ExternalLink className="absolute left-full h-3 w-3 ml-1" />
                  </SafeExternalLink>
                </div>
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
            <div className="flex flex-col">
              {isLatestAuction && ogImage && !isAuction22 && (
                <div className="flex flex-col justify-center items-center gap-1">
                  <label className="font-semibold text-xl md:text-2xl inline-flex gap-2">
                    🏆<span className="underline">Today&apos;s Winner</span>🏆
                  </label>
                  <div className="flex flex-col rounded-md justify-center items-center h-full md:h-[200px] w-full md:w-[376px] mt-1 overflow-hidden bg-white aspect-[2/1]">
                    <img
                      src={auctionImageOverrides[currentAuctionId] || ogImage}
                      alt="Open Graph"
                      className="object-cover w-full h-full cursor-pointer"
                      onClick={() => {
                        if (ogUrl) window.open(ogUrl, '_blank', 'noopener,noreferrer');
                      }}
                    />
                  </div>
                  <div className="flex flex-col items-center italic">
                    <span className={clsx(isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]", "font-normal")}>
                      The QR coin currently points to:
                    </span>
                    <div className="w-full overflow-hidden truncate">
                      <a
                        href={ogUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:opacity-80 transition-opacity"
                        title={ogUrl}
                        aria-label="redirect"
                      >
                        {formatURL(ogUrl, true)}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:flex flex-col gap-1">
              {isLatestAuction && !isAuction22 && (
                <>
                  <h2 className="font-semibold text-xl md:text-2xl text-center">
                    <span className="underline">Buy $QR</span>
                  </h2>
                  <div style={{ height: "510px" }}>
                    <UniswapWidget />
                  </div>
                </>
              )}
            </div>
          </div>

          {(!isLatestAuction || isAuction22) && currentAuctionId > 0 && (
            <WinnerAnnouncement auctionId={currentAuctionId} />
          )}
          
          {/* Mobile Uniswap Widget */}
          {isLatestAuction && !isAuction22 && (
            <div className="md:hidden w-full mt-4 mb-8">
              <h2 className="font-semibold text-xl text-center mb-4">
                <span className="underline">Buy $QR</span>
              </h2>
              <div style={{ height: "510px" }}>
                <UniswapWidget />
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-10 text-center flex flex-col items-center">
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

      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </main>
  );
} 