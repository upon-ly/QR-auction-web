"use client";

import { createContext, useContext } from "react";

// Define the WinnerData type again here or import it if needed
type WinnerData = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
  displayName: string;
  farcasterUsername: string | null;
  basename: string | null;
  pfpUrl: string | null;
  usdValue: number;
  isV1Auction: boolean;
  ensName?: string | null;
};

// Cache context to store winners data
export const WinnersCache = createContext<{
  cachedWinners: WinnerData[] | null;
  setCachedWinners: (data: WinnerData[]) => void;
}>({
  cachedWinners: null,
  setCachedWinners: () => {},
});

// Hook to access winners cache
export function useWinnersCache() {
  return useContext(WinnersCache);
} 