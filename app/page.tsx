/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AuctionNavigation } from "@/components/auction-navigation";
import { QRPage } from "@/components/QRPage";
import { AuctionDetails } from "@/components/auction-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink } from "lucide-react";

import { useFetchAuctions } from "../hooks/useFetchAuctions";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { toast } from "sonner";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "../components/SafetyDialog";
import { SafeExternalLink } from "../components/SafeExternalLink";

export default function Home() {
  const [currentAuctionId, setCurrentAuctionId] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const { auctions } = useFetchAuctions();

  const DEFAULT_DATE = Math.floor(Date.now() / 1000);

  const LATEST_AUCTION_ID = useRef(0);
  const EARLIEST_AUCTION_ID = 1;

  const handlePrevious = () => {
    if (currentAuctionId > EARLIEST_AUCTION_ID) {
      setCurrentAuctionId((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentAuctionId < LATEST_AUCTION_ID.current) {
      setCurrentAuctionId((prev) => prev + 1);
    }
  };

  const handleLatest = () => {
    setCurrentAuctionId(LATEST_AUCTION_ID.current);
  };

  const currentAuction = auctions.find((val) => {
    return Number(val.tokenId) === currentAuctionId;
  });

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;

  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } =
    useSafetyDialog();

  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    toast.info("CA copied!");
  };

  const formatDate = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000); // convert to milliseconds

    // Define options for a short month, numeric day, and numeric year.
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };

    const formattedDate = date.toLocaleDateString("en-US", options);
    return formattedDate;
  };

  useEffect(() => {
    console.log("here");
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const lastAuctionId = Number(lastAuction.tokenId);

      // Only update if the last auction ID has changed
      if (LATEST_AUCTION_ID.current !== lastAuctionId) {
        LATEST_AUCTION_ID.current = lastAuctionId;
        setCurrentAuctionId(lastAuctionId);
        setIsLoading(lastAuctionId !== 0 ? false : true);
      }
    } else {
      setIsLoading(false);
    }
  }, [auctions.length]);

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">QR Auction</h1>
        <div className="flex items-center gap-3">
          <a
            href={`${process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <span className="underline underline-offset-2">Buy $QR</span>
          </a>
          <ConnectButton
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto">
        {!isLoading && (
          <AuctionNavigation
            currentId={currentAuctionId}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLatest={handleLatest}
            date={formatDate(currentAuction?.startTime || BigInt(DEFAULT_DATE))}
            isLatest={currentAuctionId === LATEST_AUCTION_ID.current}
          />
        )}
        {isLoading && <Skeleton className="h-[40px] w-full mb-4" />}
        <div className="grid md:grid-cols-2 gap-4 md:gap-8">
          {!isLoading && (
            <div className="flex flex-col items-center justify-center p-8 h-[200px] md:h-[368px] md:p-14 bg-white rounded-lg gap-4">
              <QRPage />
              <div className="text-center">
                <SafeExternalLink
                  href={`${process.env.NEXT_PUBLIC_HOST_URL}/redirect`}
                  className="inline-flex items-center justify-center border border-gray-300 bg-white text-gray-700 px-2 md:px-4 py-1 md:py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                  onBeforeNavigate={openDialog}
                >
                  Visit Website{" "}
                  <ExternalLink className="ml-1 h-3 w-3 md:h-4 md:w-4" />
                </SafeExternalLink>
              </div>
            </div>
          )}
          {isLoading && (
            <div className="flex items-start justify-start border-gray-600 rounded-lg">
              <Skeleton className="h-[250px] w-full md:w-3xl rounded-xl" />
            </div>
          )}
          {!isLoading && currentAuctionId !== 0 && (
            <AuctionDetails id={currentAuctionId} />
          )}
          {isLoading && <Skeleton className="flex-1" />}
        </div>
      </div>

      <footer className="mt-4 md:mt-50 py-4 text-center flex flex-col items-center">
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
          className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label className="mr-1 cursor-pointer">CA: {contractAddress}</label>
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
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
