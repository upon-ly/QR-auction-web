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
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, [auctions.length]);

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">QR Auction</h1>
        <ConnectButton />
      </nav>

      {!isLoading && (
        <div className="max-w-3xl mx-auto">
          <AuctionNavigation
            currentId={currentAuctionId}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLatest={handleLatest}
            date={formatDate(currentAuction?.startTime || 0n)}
            isLatest={currentAuctionId === LATEST_AUCTION_ID.current}
          />
          <div className="grid md:grid-cols-2 gap-4 md:gap-8">
            <div className="flex items-center justify-center p-10 md:p-14 border-gray-600 border border-solid  bg-white rounded-lg">
              <QRPage />
            </div>
            <AuctionDetails id={currentAuctionId} />
          </div>
        </div>
      )}
      {isLoading && (
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-[40px] w-full mb-4" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex items-start justify-start border-gray-600 rounded-lg">
              <Skeleton className="h-[250px] w-full md:w-3xl rounded-xl" />
            </div>
            <Skeleton className="flex-1" />
          </div>
        </div>
      )}
    </main>
  );
}
