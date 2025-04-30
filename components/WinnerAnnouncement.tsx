"use client";

import { TwitterEmbed } from "./TwitterEmbed";

interface WinnerAnnouncementProps {
  auctionId: number;
}

// Map auction IDs to their corresponding tweet URLs
const ANNOUNCEMENT_TWEETS: Record<number, string> = {
  1: "https://x.com/0FJAKE/status/1897686490261438720",
  2: "https://x.com/0FJAKE/status/1898043094567735624",
  3: "https://x.com/0FJAKE/status/1898411212150276351",
  4: "https://x.com/qrcoindotfun/status/1898781199046267131",
  5: "https://x.com/qrcoindotfun/status/1899191183919702326",
  6: "https://x.com/qrcoindotfun/status/1899486649383264425",
  7: "https://x.com/qrcoindotfun/status/1899907067592552735",
  8: "https://x.com/qrcoindotfun/status/1900233321604599867",
  9: "https://x.com/qrcoindotfun/status/1900645501378220330",
  10: "https://x.com/qrcoindotfun/status/1900946833850912954",
  11: "https://x.com/qrcoindotfun/status/1901352755903738331",
  12: "https://x.com/qrcoindotfun/status/1901688919155999219",
  13: "https://x.com/qrcoindotfun/status/1902062098102050835",
  14: "https://x.com/qrcoindotfun/status/1902476625503252928",
  15: "https://x.com/qrcoindotfun/status/1902755834427531340",
  16: "https://x.com/qrcoindotfun/status/1903180354544079353",
  17: "https://x.com/qrcoindotfun/status/1903487515274650063",
  18: "https://x.com/qrcoindotfun/status/1903878962499166519",
  19: "https://x.com/qrcoindotfun/status/1904329392714629342",
  20: "https://x.com/qrcoindotfun/status/1904686185563185397",
  21: "https://x.com/qrcoindotfun/status/1905051744691740794",
  22: "https://x.com/qrcoindotfun/status/1905340393610260770",
  23: "https://x.com/qrcoindotfun/status/1905700281146556800",
  24: "https://x.com/qrcoindotfun/status/1906150804366434671",
  25: "https://x.com/qrcoindotfun/status/1906477220782321672",
  26: "https://x.com/qrcoindotfun/status/1906780642593108335",
  27: "https://x.com/qrcoindotfun/status/1907144607797764121"
};

export function WinnerAnnouncement({ auctionId }: WinnerAnnouncementProps) {
  const tweetUrl = ANNOUNCEMENT_TWEETS[auctionId];

  // Don't render anything if there's no tweet for this auction
  if (!tweetUrl) return null;

  return (
    <div className="flex flex-col justify-center items-center gap-1 w-full">
      <label className="font-semibold text-xl md:text-2xl inline-flex gap-2">
        🏆<span className="underline">Winner Announcement</span>🏆
      </label>
      <div className="mt-1 w-full max-w-[550px] mx-auto flex justify-center">
        <TwitterEmbed tweetUrl={tweetUrl} />
      </div>
    </div>
  );
} 
