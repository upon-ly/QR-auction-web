"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetchAuctions, getLatestV3AuctionId } from "@/hooks/useFetchAuctions";

// Key for storing the latest auction ID in localStorage
const LATEST_AUCTION_KEY = 'qrcoin_latest_auction_id';
// New key for storing latest V3 auction ID
const LATEST_V3_AUCTION_KEY = 'qrcoin_latest_v3_auction_id';

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

export default function HomePage() {
  const router = useRouter();
  const { auctions } = useFetchAuctions();

  useEffect(() => {
    // Try to get cached V3 auction ID first for immediate redirect
    const cachedV3AuctionId = safeLocalStorage.getItem(LATEST_V3_AUCTION_KEY);
    
    if (cachedV3AuctionId && parseInt(cachedV3AuctionId) >= 62) {
      // If we have a cached V3 ID, redirect immediately
      router.replace(`/auction/${cachedV3AuctionId}`);
      return;
    }
    
    // Fall back to checking auction data if no valid cached V3 ID exists
    if (auctions && auctions.length > 0) {
      // Get the latest auction of any version
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      
      // Get the latest V3 auction (ID >= 62)
      const latestV3Id = getLatestV3AuctionId(auctions);
      
      if (latestV3Id > 0) {
        // We have at least one V3 auction, save to localStorage
        safeLocalStorage.setItem(LATEST_V3_AUCTION_KEY, latestV3Id.toString());
        // Redirect to the latest V3 auction
        router.replace(`/auction/${latestV3Id}`);
      } else if (latestId > 0) {
        // No V3 auctions yet, use latest of any version
        safeLocalStorage.setItem(LATEST_AUCTION_KEY, latestId.toString());
        // Redirect to the latest auction
        router.replace(`/auction/${latestId}`);
      }
    }
  }, [auctions, router]);
}
