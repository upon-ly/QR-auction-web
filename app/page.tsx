"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetchAuctions } from "@/hooks/useFetchAuctions";

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

export default function HomePage() {
  const router = useRouter();
  const { auctions } = useFetchAuctions();

  useEffect(() => {
    // Try to get cached auction ID first for immediate redirect
    const cachedAuctionId = safeLocalStorage.getItem(LATEST_AUCTION_KEY);
    
    if (cachedAuctionId) {
      // If we have a cached ID, redirect immediately
      router.replace(`/auction/${cachedAuctionId}`);
      return;
    }
    
    // Fall back to fetching from API if no cached ID exists
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      
      if (latestId > 0) {
        // Save to localStorage for future use
        safeLocalStorage.setItem(LATEST_AUCTION_KEY, latestId.toString());
        // Redirect to the latest auction
        router.replace(`/auction/${latestId}`);
      }
    }
  }, [auctions, router]);
}
