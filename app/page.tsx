/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AuctionNavigation } from "@/components/auction-navigation";
import { QRPage } from "@/components/QRPage";
import { AuctionDetails } from "@/components/auction-details";
import { Skeleton } from "@/components/ui/skeleton";

import { useFetchAuctions } from "../hooks/useFetchAuctions";

export default function Home() {
  const [currentAuctionId, setCurrentAuctionId] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
          {!isLoading && currentAuctionId !== 0 && (
            <div className="flex items-center justify-center p-10 h-[200px] md:h-full md:p-14 bg-white rounded-lg">
              <QRPage />
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
    </main>
  );
}
