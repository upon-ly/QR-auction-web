"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useFetchSettledAuc } from "@/hooks/useFetchSettledAuc";
import { formatEther } from "viem";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { Button } from "@/components/ui/button";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getFarcasterUsersBulk } from "@/utils/farcaster";
import useEthPrice from "@/hooks/useEthPrice";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { QRContextMenu } from "@/components/QRContextMenu";
import { Copy, Check, ArrowUp, ArrowDown } from "lucide-react";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import { RandomColorAvatar } from "@/components/RandomAvatar";
import { ThemeDialog } from "@/components/ThemeDialog";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import clsx from "clsx";
import { toast } from "sonner";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { useAccount } from 'wagmi';

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

// Sort types
type SortColumn = 'auction' | 'winner' | 'bid' | 'link';
type SortDirection = 'asc' | 'desc';

// Global cache
let globalCachedWinners: WinnerData[] | null = null;

export default function WinnersPage() {
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataInitialized, setDataInitialized] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isConnected } = useAccount();
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('auction');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Explicitly pass a v1 tokenId to ensure it uses the v1 contract
  const { fetchHistoricalAuctions: fetchV1Auctions } = useFetchSettledAuc(1n);
  const { fetchHistoricalAuctions: fetchV2Auctions } = useFetchSettledAuc(23n);
  
  const isBaseColors = useBaseColors();
  const router = useRouter();
  
  // Price data
  const { ethPrice: ethPriceData, isLoading: ethPriceLoading } = useEthPrice();
  const { priceUsd: tokenPriceUsd, isLoading: tokenPriceLoading } = useTokenPrice();

  // Calculate actual ETH price from data
  const ethPrice = useMemo(() => {
    return ethPriceData?.ethereum?.usd || 0;
  }, [ethPriceData]);
  
  // Check if all required data is available
  const pricesLoaded = useMemo(() => {
    return ethPrice > 0 && tokenPriceUsd !== null;
  }, [ethPrice, tokenPriceUsd]);

  // Fetch all settled auctions
  const fetchWinners = useCallback(async () => {
    // If we have cached data, use it
    if (globalCachedWinners && globalCachedWinners.length > 0) {
      console.log("Using cached winners data");
      setWinners(globalCachedWinners);
      setDataInitialized(true);
      setIsLoading(false);
      return;
    }
    
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
          
          // Calculate USD value using ETH price for v1 auctions
          const ethAmount = parseFloat(formatEther(auction.amount));
          const usdValue = ethAmount * ethPrice;
          
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
          
          // Calculate USD value using token price for v2 auctions
          const qrTokenAmount = parseFloat(formatEther(auction.amount));
          const usdValue = qrTokenAmount * (tokenPriceUsd || 0);
          
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
      
      // Sort by tokenId in descending order initially
      uniqueAuctions.sort((a, b) => (Number(b.tokenId) - Number(a.tokenId)));
      
      // Update global cache
      globalCachedWinners = uniqueAuctions;
      
      setWinners(uniqueAuctions);
      setDataInitialized(true);
    } catch (error) {
      console.error("Error fetching winners:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchV1Auctions, fetchV2Auctions, ethPrice, tokenPriceUsd, pricesLoaded]);
  
  // Effect to fetch winners once prices are loaded
  useEffect(() => {
    if (pricesLoaded && !dataInitialized) {
      fetchWinners();
    }
  }, [pricesLoaded, fetchWinners, dataInitialized]);
  
  // Display loading state based on combined conditions
  const showLoading = isLoading || ethPriceLoading || tokenPriceLoading || !pricesLoaded || !dataInitialized;
  
  const handleLogoClick = () => {
    router.push('/');
  };

  // Get display name based on priority: basename > farcaster username > ens name > truncated address
  const getDisplayName = (winner: WinnerData) => {
    if (winner.basename) {
      return winner.basename;
    } else if (winner.farcasterUsername) {
      return `@${winner.farcasterUsername}`;
    } else if (winner.ensName) {
      return winner.ensName;
    } else {
      // Properly truncate Ethereum address for clean display
      return `${winner.winner.slice(0, 4)}...${winner.winner.slice(-4)}`;
    }
  };

  // Function to handle user name click - open Warpcast profile if it exists
  const handleNameClick = (winner: WinnerData) => {
    if (winner.farcasterUsername) {
      // Open Warpcast profile in new tab
      let username = winner.farcasterUsername;
      
      // Quick temp fix - replace !217978 with softwarecurator (copied from WarpcastLogo component)
      username = username === "!217978" ? "softwarecurator" : username;
      
      window.open(`https://warpcast.com/${username}`, '_blank');
    }
  };

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };
  
  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column with default direction
      setSortColumn(column);
      // Default directions by column
      if (column === 'auction') {
        setSortDirection('desc'); // Newest first by default
      } else if (column === 'bid') {
        setSortDirection('desc'); // Highest bids first by default
      } else {
        setSortDirection('asc'); // Alphabetical for other columns
      }
    }
  };
  
  // Get sorted winners
  const sortedWinners = useMemo(() => {
    if (!winners.length) return [];
    
    return [...winners].sort((a, b) => {
      const sortMultiplier = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortColumn) {
        case 'auction':
          return sortMultiplier * (Number(a.tokenId) - Number(b.tokenId));
          
        case 'winner':
          const nameA = getDisplayName(a).toLowerCase();
          const nameB = getDisplayName(b).toLowerCase();
          
          // Sort by whether they have Farcaster first
          if (a.farcasterUsername && !b.farcasterUsername) return -1 * sortMultiplier;
          if (!a.farcasterUsername && b.farcasterUsername) return 1 * sortMultiplier;
          
          // Then alphabetically
          return sortMultiplier * nameA.localeCompare(nameB);
          
        case 'bid':
          return sortMultiplier * (a.usdValue - b.usdValue);
          
        case 'link':
          return sortMultiplier * (a.url ?? '').localeCompare(b.url ?? '');
          
        default:
          return 0;
      }
    });
  }, [winners, sortColumn, sortDirection]);
  
  // Render sort indicators
  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return null;
    
    return sortDirection === 'asc' 
      ? <ArrowUp className="inline-block w-4 h-4 ml-1" /> 
      : <ArrowDown className="inline-block w-4 h-4 ml-1" />;
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8 mt-8 md:mt-4 lg:mt-4">
        <QRContextMenu className="inline-block" isHeaderLogo>
          <h1
            onClick={handleLogoClick}
            className="text-2xl font-bold cursor-pointer"
          >
            $QR
          </h1>
        </QRContextMenu>
        <div className="flex items-center gap-1 md:gap-3">
          <Link href="/about">
            <Button
              variant="outline"
              className={isConnected ? "h-10 px-3 text-sm font-medium" : "h-10 w-10 md:w-auto md:px-3 md:text-sm md:font-medium"}
            >
              <span className="md:hidden text-lg">{isConnected ? "What is this?" : "?"}</span>
              <span className="hidden md:inline">What is this?</span>
            </Button>
          </Link>
          
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10"
                : "h-10 w-10"
            }
          >
            <div className="h-5 w-5 flex items-center justify-center">
              🏆
            </div>
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10"
                : "h-10 w-10"
            }
            onClick={() => setThemeDialogOpen(true)}
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 20 20" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
            >
              <circle 
                cx="10" 
                cy="10" 
                r="9" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                fill="none"
              />
              <path 
                d="M10 1.5C5.3 1.5 1.5 5.3 1.5 10C1.5 14.7 5.3 18.5 10 18.5L10 1.5Z" 
                fill="currentColor" 
              />
            </svg>
          </Button>
          
          <div className="relative">
            <ConnectButton
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "full",
              }}
              chainStatus="none"
              showBalance={false}
              label="Connect Wallet"
            />
            <div className="absolute right-0 top-full mt-2 pr-1">
              <ConnectionIndicator />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[95vw] md:max-w-4xl mx-auto">
        <div className="flex flex-col mb-6 md:mb-8">
          <div className="flex items-center mb-1 md:mb-2">
            <h1 className="text-2xl md:text-3xl font-bold">🏆 All-Time Winners</h1>
          </div>
          <p className="text-sm md:text-lg text-gray-600 dark:text-gray-400">
            Complete history of all auction winners
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th 
                    scope="col" 
                    className="w-[32px] md:w-auto px-0 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    style={{ textAlign: 'center' }}
                    onClick={() => handleSort('auction')}
                  >
                    #
                  </th>
                  <th 
                    scope="col" 
                    className="w-[100px] md:w-auto px-1 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort('winner')}
                  >
                    Winner {renderSortIcon('winner')}
                  </th>
                  <th 
                    scope="col" 
                    className="w-[45px] md:w-auto px-0 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort('bid')}
                  >
                    Bid {renderSortIcon('bid')}
                  </th>
                  <th 
                    scope="col" 
                    className="w-[100px] md:w-auto px-0 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort('link')}
                  >
                    Link {renderSortIcon('link')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {showLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap">
                        <Skeleton className="h-3.5 w-5 md:h-6 md:w-10 mx-auto" />
                      </td>
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Skeleton className="h-7 w-7 md:h-8 md:w-8 rounded-full mr-1 md:mr-2 flex-shrink-0" />
                          <Skeleton className="h-3.5 w-16 md:h-6 md:w-32" />
                        </div>
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap">
                        <Skeleton className="h-3.5 w-10 md:h-6 md:w-24" />
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap">
                        <Skeleton className="h-3.5 w-24 md:h-6 md:w-40" />
                      </td>
                    </tr>
                  ))
                ) : (
                  sortedWinners.map((winner) => (
                    <tr key={winner.tokenId.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm font-medium text-center">
                        <Link href={`/auction/${winner.tokenId}`} className="hover:underline">
                          #{winner.tokenId.toString()}
                        </Link>
                      </td>
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        <div className="flex items-center">
                          {winner.pfpUrl ? (
                            <img 
                              src={winner.pfpUrl} 
                              alt="Profile" 
                              className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover mr-1 md:mr-2 flex-shrink-0"
                            />
                          ) : (
                            <div className="mr-1 md:mr-2 flex-shrink-0">
                              <RandomColorAvatar size={{ mobile: 7, desktop: 8 }} />
                            </div>
                          )}
                          <div className="flex items-center truncate max-w-[110px] md:max-w-full">
                            <span 
                              className={`truncate ${winner.farcasterUsername ? 'hover:underline cursor-pointer' : ''}`}
                              onClick={() => handleNameClick(winner)}
                            >
                              {getDisplayName(winner)}
                            </span>
                            {winner.farcasterUsername && (
                              <div className="hidden md:block flex-shrink-0">
                                <WarpcastLogo 
                                  size="sm" 
                                  username={winner.farcasterUsername} 
                                  className="ml-1 opacity-80 hover:opacity-100"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        <div className="font-mono">
                          ${Math.floor(winner.usdValue)}
                        </div>
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        {winner.url ? (
                          <a 
                            href={winner.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center hover:underline text-[#0000FF] dark:text-[#00FF00] max-w-[100px] md:max-w-[400px] truncate"
                          >
                            <span className="truncate">{winner.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 md:h-4 md:w-4 ml-1 flex-shrink-0 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">No URL</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="mt-10 text-center flex flex-col items-center">
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
          className="inline-flex items-center text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label
            className={clsx(
              isBaseColors ? "text-foreground" : "",
              "mr-1 cursor-pointer"
            )}
          >
            CA: {contractAddress}
          </label>
          <button
            onClick={copyToClipboard}
            className={clsx(
              isBaseColors
                ? " text-foreground hover:text-primary/90"
                : "hover:bg-gray-100",
              "p-1 rounded-full transition-colors"
            )}
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check
                className={clsx(
                  isBaseColors ? "text-foreground" : "text-green-500",
                  "h-3 w-3"
                )}
              />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
        {(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" &&
          process.env.NODE_ENV === "development") ||
          (process.env.VERCEL_ENV === "preview" && (
            <Link
              href="/debug"
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Debug Panel
            </Link>
          ))}
      </footer>
      
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </main>
  );
} 