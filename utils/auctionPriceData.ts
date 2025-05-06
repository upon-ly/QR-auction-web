// This file is kept for backward compatibility
// Now fetches data from database instead of hardcoded values

export type AuctionPriceData = {
  spotPrice: number;  // USD spot price at time of auction
  version: "v1" | "v2";
};

// Function to get auction version without hardcoded data
export function getAuctionVersion(tokenId: string | number | bigint): "v1" | "v2" | "v3" | null {
  const id = Number(tokenId);
  if (id >= 1 && id <= 22) return "v1";
  if (id >= 23 && id <= 35) return "v2";
  if (id >= 36) return "v3";
  return null;
}

// Now fetches from database, kept for compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAuctionPriceData(tokenId: string | number | bigint): AuctionPriceData | null {
  return null; // Now handled via direct database call in components
} 