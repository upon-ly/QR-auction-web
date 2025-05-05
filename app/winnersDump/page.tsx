"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useFetchSettledAuc } from "@/hooks/useFetchSettledAuc";
import { formatEther } from "viem";
import { Copy, Check, ArrowUpDown } from "lucide-react";
import { getFarcasterUsersBulk } from "@/utils/farcaster";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import { getAuctionPriceData } from "@/utils/auctionPriceData";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import useEthPrice from "@/hooks/useEthPrice";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Type definition for winner data
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

export default function WinnersDumpPage() {
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<"sql" | "json" | "supabase">("supabase");
  
  // Explicitly pass a v1 tokenId to ensure it uses the v1 contract
  const { fetchHistoricalAuctions: fetchV1Auctions } = useFetchSettledAuc(1n);
  const { fetchHistoricalAuctions: fetchV2Auctions } = useFetchSettledAuc(23n);
  
  // Price data
  const { ethPrice: ethPriceData, isLoading: ethPriceLoading } = useEthPrice();
  const { priceUsd: tokenPriceUsd, isLoading: tokenPriceLoading } = useTokenPrice();

  // Calculate actual ETH price from data
  const ethPrice = useMemo(() => {
    return ethPriceData?.ethereum?.usd || 0;
  }, [ethPriceData]);
  
  // Check if all required data is available
  const pricesLoaded = useMemo(() => {
    return !ethPriceLoading && !tokenPriceLoading && ethPrice > 0 && tokenPriceUsd !== null;
  }, [ethPrice, tokenPriceUsd, ethPriceLoading, tokenPriceLoading]);

  // Fetch all settled auctions
  const fetchWinners = useCallback(async () => {
    // Only proceed if prices are loaded
    if (!pricesLoaded) return;
    
    try {
      setIsLoading(true);
      
      // Fetch v1 auctions (1-22) and v2 auctions (23+)
      const v1Auctions = await fetchV1Auctions();
      const v2Auctions = await fetchV2Auctions();
      
      // Create a set to track unique token IDs to avoid duplicates
      const tokenIdSet = new Set<string>();
      const uniqueAuctions: WinnerData[] = [];
      
      // Process V1 auctions (1-22)
      if (v1Auctions && v1Auctions.length > 0) {
        const v1Addresses = v1Auctions
          .filter(auction => Number(auction.tokenId) <= 22)
          .map(auction => auction.winner.toLowerCase());
          
        const farcasterInfoMapV1 = await getFarcasterUsersBulk(v1Addresses);
        
        // Get ENS names for v1 auctions
        const ensPromises = v1Addresses.map(async (address) => {
          try {
            const result = await getName({
              address: address as `0x${string}`,
              chain: base,
            });
            return { address, name: result || null };
          } catch (error) {
            console.error(`Error fetching ENS name for ${address}:`, error);
            return { address, name: null };
          }
        });
        
        const ensResults = await Promise.all(ensPromises);
        const ensMap = new Map<string, string | null>();
        ensResults.forEach(({ address, name }) => {
          ensMap.set(address, name);
        });
        
        for (const auction of v1Auctions) {
          const tokenIdStr = auction.tokenId.toString();
          const auctionIdNum = Number(auction.tokenId);
          
          // Skip if already processed or not in v1 range
          if (tokenIdSet.has(tokenIdStr) || auctionIdNum > 22) continue;
          
          tokenIdSet.add(tokenIdStr);
          
          // Get user info
          const address = auction.winner.toLowerCase();
          const farcasterInfo = farcasterInfoMapV1.get(address);
          const ensName = ensMap.get(address);
          
          // Get the historical price data
          const histData = getAuctionPriceData(auction.tokenId);
          
          // Calculate USD value using historical spot price if available, otherwise use current ETH price
          const ethAmount = parseFloat(formatEther(auction.amount));
          const usdValue = histData 
            ? histData.spotPrice 
            : ethAmount * ethPrice;
          
          uniqueAuctions.push({
            ...auction,
            displayName: farcasterInfo?.displayName || ensName || auction.winner.slice(0, 6) + '...' + auction.winner.slice(-4),
            farcasterUsername: farcasterInfo?.username || null,
            basename: null, 
            pfpUrl: farcasterInfo?.pfpUrl || null,
            usdValue,
            isV1Auction: true,
            ensName,
          });
        }
      }
      
      // Process V2 auctions (23+)
      if (v2Auctions && v2Auctions.length > 0) {
        const v2Addresses = v2Auctions
          .filter(auction => Number(auction.tokenId) >= 23)
          .map(auction => auction.winner.toLowerCase());
          
        const farcasterInfoMapV2 = await getFarcasterUsersBulk(v2Addresses);
        
        // Get ENS names for v2 auctions
        const ensPromises = v2Addresses.map(async (address) => {
          try {
            const result = await getName({
              address: address as `0x${string}`,
              chain: base,
            });
            return { address, name: result || null };
          } catch (error) {
            console.error(`Error fetching ENS name for ${address}:`, error);
            return { address, name: null };
          }
        });
        
        const ensResults = await Promise.all(ensPromises);
        const ensMap = new Map<string, string | null>();
        ensResults.forEach(({ address, name }) => {
          ensMap.set(address, name);
        });
        
        for (const auction of v2Auctions) {
          const tokenIdStr = auction.tokenId.toString();
          const auctionIdNum = Number(auction.tokenId);
          
          // Skip if already processed or not in v2 range
          if (tokenIdSet.has(tokenIdStr) || auctionIdNum < 23) continue;
          
          tokenIdSet.add(tokenIdStr);
          
          // Get user info
          const address = auction.winner.toLowerCase();
          const farcasterInfo = farcasterInfoMapV2.get(address);
          const ensName = ensMap.get(address);
          
          // Get the historical price data
          const histData = getAuctionPriceData(auction.tokenId);
          
          // Calculate USD value using historical spot price if available, otherwise use current token price
          const qrTokenAmount = parseFloat(formatEther(auction.amount));
          const usdValue = histData 
            ? histData.spotPrice 
            : qrTokenAmount * (tokenPriceUsd || 0);
          
          uniqueAuctions.push({
            ...auction,
            displayName: farcasterInfo?.displayName || ensName || auction.winner.slice(0, 6) + '...' + auction.winner.slice(-4),
            farcasterUsername: farcasterInfo?.username || null,
            basename: null,
            pfpUrl: farcasterInfo?.pfpUrl || null,
            usdValue,
            isV1Auction: false,
            ensName,
          });
        }
      }
      
      // Sort by tokenId
      uniqueAuctions.sort((a, b) => (Number(a.tokenId) - Number(b.tokenId)));
      
      setWinners(uniqueAuctions);
    } catch (error) {
      console.error("Error fetching winners:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchV1Auctions, fetchV2Auctions, ethPrice, tokenPriceUsd, pricesLoaded]);
  
  // Effect to fetch winners once prices are loaded
  useEffect(() => {
    if (pricesLoaded && winners.length === 0) {
      fetchWinners();
    }
  }, [pricesLoaded, fetchWinners, winners.length]);

  // Format data based on selected format
  const formattedData = useMemo(() => {
    if (winners.length === 0) return "";

    switch (format) {
      case "sql":
        // SQL INSERT statements
        return winners.map(winner => {
          return `INSERT INTO public.winners (token_id, winner_address, amount, url, display_name, farcaster_username, basename, usd_value, is_v1_auction, ens_name) 
VALUES (
  ${winner.tokenId.toString()}, 
  '${winner.winner}', 
  ${formatEther(winner.amount)}, 
  ${winner.url ? `'${winner.url.replace(/'/g, "''")}'` : 'NULL'}, 
  ${winner.displayName ? `'${winner.displayName.replace(/'/g, "''")}'` : 'NULL'}, 
  ${winner.farcasterUsername ? `'${winner.farcasterUsername.replace(/'/g, "''")}'` : 'NULL'}, 
  ${winner.basename ? `'${winner.basename.replace(/'/g, "''")}'` : 'NULL'}, 
  ${winner.usdValue.toFixed(2)}, 
  ${winner.isV1Auction}, 
  ${winner.ensName ? `'${winner.ensName.replace(/'/g, "''")}'` : 'NULL'}
) ON CONFLICT (token_id) DO UPDATE 
SET 
  winner_address = EXCLUDED.winner_address,
  amount = EXCLUDED.amount,
  url = EXCLUDED.url,
  display_name = EXCLUDED.display_name,
  farcaster_username = EXCLUDED.farcaster_username,
  basename = EXCLUDED.basename,
  usd_value = EXCLUDED.usd_value,
  is_v1_auction = EXCLUDED.is_v1_auction,
  ens_name = EXCLUDED.ens_name;`;
        }).join("\n\n");
      
      case "json":
        // JSON array
        return JSON.stringify(winners.map(winner => ({
          token_id: winner.tokenId.toString(),
          winner_address: winner.winner,
          amount: formatEther(winner.amount),
          url: winner.url || null,
          display_name: winner.displayName || null,
          farcaster_username: winner.farcasterUsername || null,
          basename: winner.basename || null,
          pfp_url: winner.pfpUrl || null,
          usd_value: winner.usdValue,
          is_v1_auction: winner.isV1Auction,
          ens_name: winner.ensName || null
        })), null, 2);
      
      case "supabase":
        // Supabase upsert format
        return `
// Use this code with your Supabase client

const { error } = await supabase.from("winners").upsert([
  ${winners.map(winner => `{
    token_id: ${winner.tokenId.toString()},
    winner_address: "${winner.winner}",
    amount: ${formatEther(winner.amount)},
    url: ${winner.url ? `"${winner.url.replace(/"/g, '\\"')}"` : 'null'},
    display_name: ${winner.displayName ? `"${winner.displayName.replace(/"/g, '\\"')}"` : 'null'},
    farcaster_username: ${winner.farcasterUsername ? `"${winner.farcasterUsername.replace(/"/g, '\\"')}"` : 'null'},
    basename: ${winner.basename ? `"${winner.basename.replace(/"/g, '\\"')}"` : 'null'},
    pfp_url: ${winner.pfpUrl ? `"${winner.pfpUrl.replace(/"/g, '\\"')}"` : 'null'},
    usd_value: ${winner.usdValue.toFixed(2)},
    is_v1_auction: ${winner.isV1Auction},
    ens_name: ${winner.ensName ? `"${winner.ensName.replace(/"/g, '\\"')}"` : 'null'}
  }`).join(",\n  ")}
], { onConflict: "token_id" });

if (error) {
  console.error("Error inserting winners:", error);
}`;
        
      default:
        return "";
    }
  }, [winners, format]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedData);
    setCopied(true);
    toast.success("Data copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-center">🏆 Winners Data Dump</h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 text-center mt-2">
            Export auction winners data for database insertion
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Export Format</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isLoading || !pricesLoaded 
                  ? "Loading winner data..." 
                  : `${winners.length} winners found`}
              </p>
            </div>
            <Button 
              onClick={copyToClipboard} 
              disabled={isLoading || winners.length === 0}
              className="flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy to Clipboard
                </>
              )}
            </Button>
          </div>

          <Tabs value={format} onValueChange={(v) => setFormat(v as "sql" | "json" | "supabase")} className="w-full">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="supabase">Supabase JS</TabsTrigger>
              <TabsTrigger value="sql">SQL</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value={format} className="mt-0">
              <div className="relative">
                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto text-xs md:text-sm h-[60vh] whitespace-pre-wrap">
                  {isLoading || !pricesLoaded ? (
                    <div className="flex items-center justify-center h-full">
                      <ArrowUpDown className="h-6 w-6 animate-spin mr-2" />
                      <span>Loading winner data...</span>
                    </div>
                  ) : winners.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <span>No winner data found.</span>
                    </div>
                  ) : (
                    <code>{formattedData}</code>
                  )}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">How to Use</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Copy the data in your preferred format</li>
            <li>For Supabase JS: Use this code with your Supabase client in a script or admin panel</li>
            <li>For SQL: Run these statements directly in your database</li>
            <li>For JSON: Use this data for any custom import process</li>
            <li>Data includes token IDs, winner addresses, bid amounts, URLs, and user metadata</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
