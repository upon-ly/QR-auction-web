"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetchAuctions, getLatestV3AuctionId } from "@/hooks/useFetchAuctions";

// Key for storing auction cache data in localStorage
const AUCTION_CACHE_KEY = 'qrcoin_auction_cache';

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
  },
  // Get the auction cache as an object
  getAuctionCache: (): { latestAuctionId: number, latestV3AuctionId: number, timestamp?: number } => {
    try {
      const cacheStr = localStorage.getItem(AUCTION_CACHE_KEY);
      if (cacheStr) {
        return JSON.parse(cacheStr);
      }
    } catch (e) {
      console.warn('Error accessing localStorage cache:', e);
    }
    return { latestAuctionId: 0, latestV3AuctionId: 0 };
  },
  // Update the auction cache
  updateAuctionCache: (latestAuctionId: number, latestV3AuctionId: number): void => {
    try {
      localStorage.setItem(AUCTION_CACHE_KEY, JSON.stringify({ 
        latestAuctionId, 
        latestV3AuctionId,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Error updating localStorage cache:', e);
    }
  }
};

export default function HomePage() {
  const router = useRouter();
  const { auctions } = useFetchAuctions();

  useEffect(() => {
    // Try to get cached auction data first for immediate redirect
    const cache = safeLocalStorage.getAuctionCache();
    
    // Check if cache is still fresh (1 hour expiration)
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    const cacheAge = cache.timestamp ? Date.now() - cache.timestamp : Infinity;
    const isCacheFresh = cacheAge < ONE_HOUR;
    
    // If we have a fresh cached V3 auction ID, redirect immediately to it
    if (cache.latestV3AuctionId >= 62 && isCacheFresh) {
      router.replace(`/auction/${cache.latestV3AuctionId}`);
      return;
    }
    
    // Fall back to checking auction data if cache is expired or no valid cached V3 ID exists
    if (auctions && auctions.length > 0) {
      // Get the latest auction of any version
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      
      // Get the latest V3 auction (ID >= 62)
      const latestV3Id = getLatestV3AuctionId(auctions);
      
      // Update the cache with the latest values
      safeLocalStorage.updateAuctionCache(latestId, latestV3Id);
      
      // Redirect to the latest V3 auction if available, otherwise use latest of any version
      if (latestV3Id > 0) {
        router.replace(`/auction/${latestV3Id}`);
      } else if (latestId > 0) {
        router.replace(`/auction/${latestId}`);
      }
    }
  }, [auctions, router]);
}
