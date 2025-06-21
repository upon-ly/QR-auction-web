"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useBaseColors } from "@/hooks/useBaseColors";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ArrowUp, ArrowDown } from "lucide-react";
import { RandomColorAvatar } from "@/components/RandomAvatar";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import clsx from "clsx";
import { toast } from "sonner";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getFarcasterProfilePicture } from "@/utils/farcaster";
import { frameSdk } from "@/lib/frame-sdk-singleton";

// Initialize Supabase client once, outside the component
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Type definition for winner data from Supabase
type WinnerData = {
  id: number;
  token_id: string;
  winner_address: string;
  amount: string;
  url: string | null;
  display_name: string | null;
  farcaster_username: string | null;
  twitter_username: string | null;
  basename: string | null;
  usd_value: number | null;
  is_v1_auction: boolean | null;
  ens_name: string | null;
  pfp_url: string | null;
  created_at: string | null;
};

// Sort types
type SortColumn = 'auction' | 'winner' | 'bid' | 'link';
type SortDirection = 'asc' | 'desc';

// Cache winners data between renders to prevent flickering
let cachedWinners: WinnerData[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 1 minute

// Cache for profile pictures
let cachedProfilePics: Record<string, string | null> = {};

// Try to load cached profile pictures from localStorage
if (typeof window !== 'undefined') {
  try {
    const storedPics = localStorage.getItem('qrcoin_profile_pics');
    if (storedPics) {
      cachedProfilePics = JSON.parse(storedPics);
    }
  } catch (e) {
    console.error('Error loading cached profile pics:', e);
  }
}

export default function WinnersPage() {
  const [winners, setWinners] = useState<WinnerData[]>(cachedWinners || []);
  const [isLoading, setIsLoading] = useState(!cachedWinners);
  const [copied, setCopied] = useState(false);
  const [profilePictures, setProfilePictures] = useState<Record<string, string | null>>(cachedProfilePics || {});
  const isFrameRef = useRef(false);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('auction');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const isBaseColors = useBaseColors();

  // Check if we're running in a Farcaster frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrameRef.current = !!context?.user;
        console.log("Winners page frame context check:", isFrameRef.current ? "In frame" : "Not in frame");
      } catch (error) {
        console.error("Error checking frame context:", error);
      }
    }
    checkFrameContext();
  }, []);
  
  // Add a general handler for external links
  const handleExternalLink = async (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (isFrameRef.current) {
      e.preventDefault();
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
      }
    }
  };

  // Fetch winners from Supabase
  const fetchWinners = useCallback(async () => {
    // Use cached data if it's recent enough
    const now = Date.now();
    if (cachedWinners && now - lastFetchTime < CACHE_DURATION) {
      setWinners(cachedWinners);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Fetch all winners from Supabase
      const { data, error } = await supabase
        .from('winners')
        .select('*')
        .order('token_id', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      if (data) {
        // Update cache
        cachedWinners = data;
        lastFetchTime = now;
        setWinners(data);
      }
    } catch (error) {
      console.error("Error fetching winners from Supabase:", error);
      // If we have cached data, fall back to it on error
      if (cachedWinners) {
        setWinners(cachedWinners);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Effect to fetch winners on page load
  useEffect(() => {
    fetchWinners();
    
    // Optionally set up a refresh interval
    const interval = setInterval(() => {
      fetchWinners();
    }, CACHE_DURATION);
    
    return () => clearInterval(interval);
  }, [fetchWinners]);
  
  // Effect to fetch profile pictures for winners without them
  useEffect(() => {
    // Only look for winners that don't have profile pics in our cache
    const winnersNeedingPfps = winners.filter(
      w => w.farcaster_username && 
           !profilePictures[w.token_id] && 
           (!w.pfp_url || w.pfp_url === "null")
    );
    
    if (winnersNeedingPfps.length === 0) return;
    
    // Fetch profile pictures
    const fetchPfps = async () => {
      const newPictures: Record<string, string | null> = {};
      
      await Promise.all(
        winnersNeedingPfps.map(async (winner) => {
          if (!winner.farcaster_username) return;
          
          try {
            const pfpUrl = await getFarcasterProfilePicture(winner.farcaster_username);
            if (pfpUrl) {
              newPictures[winner.token_id] = pfpUrl;
              
              // Also update the database if we found a profile picture
              await supabase
                .from('winners')
                .update({ pfp_url: pfpUrl })
                .eq('token_id', winner.token_id);
            }
          } catch (error) {
            console.error(`Error fetching pfp for ${winner.farcaster_username}:`, error);
          }
        })
      );
      
      if (Object.keys(newPictures).length > 0) {
        // Update state with new pictures
        const updatedPics = { ...profilePictures, ...newPictures };
        setProfilePictures(updatedPics);
        
        // Update module-level cache
        cachedProfilePics = { ...cachedProfilePics, ...newPictures };
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('qrcoin_profile_pics', JSON.stringify(cachedProfilePics));
          } catch (e) {
            console.error('Error saving profile pics to localStorage:', e);
          }
        }
      }
    };
    
    fetchPfps();
  }, [winners, profilePictures]);
  
  // Get display name based on priority: twitter username > farcaster username > basename > ens name > truncated address
  const getDisplayName = (winner: WinnerData) => {
    if (winner.twitter_username) {
      return `@${winner.twitter_username}`;
    } else if (winner.farcaster_username) {
      return `@${winner.farcaster_username}`;
    } else if (winner.basename) {
      return winner.basename;
    } else if (winner.ens_name) {
      return winner.ens_name;
    } else {
      // Properly truncate Ethereum address for clean display
      return `${winner.winner_address.slice(0, 4)}...${winner.winner_address.slice(-4)}`;
    }
  };

  // Function to handle user name click - open Twitter or Warpcast profile if available
  const handleNameClick = async (winner: WinnerData, e?: React.MouseEvent) => {
    let url: string | null = null;
    
    if (winner.twitter_username) {
      // Open Twitter profile
      url = `https://x.com/${winner.twitter_username}`;
    } else if (winner.farcaster_username) {
      // Open Warpcast profile
      let username = winner.farcaster_username;
      
      // Quick temp fix - replace !217978 with softwarecurator (copied from WarpcastLogo component)
      username = username === "!217978" ? "softwarecurator" : username;
      
      url = `https://warpcast.com/${username}`;
    }
    
    if (url) {
      if (e) e.preventDefault();
      
      if (isFrameRef.current) {
        try {
          await frameSdk.redirectToUrl(url);
        } catch (error) {
          console.error("Error opening profile in frame:", error);
        }
      } else {
        window.open(url, '_blank', "noopener,noreferrer");
      }
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
          return sortMultiplier * (Number(a.token_id) - Number(b.token_id));
          
        case 'winner':
          const nameA = getDisplayName(a).toLowerCase();
          const nameB = getDisplayName(b).toLowerCase();
          
          // Sort by whether they have Twitter first, then Farcaster, then alphabetically
          if (a.twitter_username && !b.twitter_username) return -1 * sortMultiplier;
          if (!a.twitter_username && b.twitter_username) return 1 * sortMultiplier;
          if (a.farcaster_username && !b.farcaster_username) return -1 * sortMultiplier;
          if (!a.farcaster_username && b.farcaster_username) return 1 * sortMultiplier;
          
          // Then alphabetically
          return sortMultiplier * nameA.localeCompare(nameB);
          
        case 'bid':
          const aValue = a.usd_value || 0;
          const bValue = b.usd_value || 0;
          return sortMultiplier * (aValue - bValue);
          
        case 'link':
          // Handle null URLs in sort
          const urlA = a.url || '';
          const urlB = b.url || '';
          return sortMultiplier * urlA.localeCompare(urlB);
          
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

  // Get profile picture for a winner - prioritize Twitter, then our cached versions, then database
  const getProfilePicture = (winner: WinnerData) => {
    // First check if we have a Twitter username - use unavatar.io for Twitter pfps
    if (winner.twitter_username) {
      return `https://unavatar.io/x/${winner.twitter_username}`;
    }
    
    // Then check our local state/cache for fetched Farcaster pictures
    if (profilePictures[winner.token_id]) {
      return profilePictures[winner.token_id];
    }
    
    // Then use the one from database if available
    if (winner.pfp_url && winner.pfp_url !== "null") {
      // Add to our cache for future use
      const newPics = { ...profilePictures };
      newPics[winner.token_id] = winner.pfp_url;
      setProfilePictures(newPics);
      
      // Update module cache too
      cachedProfilePics[winner.token_id] = winner.pfp_url;
      
      return winner.pfp_url;
    }
    return null;
  };
  
  // Preload profile images
  useEffect(() => {
    const picUrls = Object.values(profilePictures).filter(Boolean) as string[];
    
    picUrls.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, [profilePictures]);

  return (
    <main className="min-h-screen p-4 md:px-8 md:pb-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col mb-6 md:mb-8">
          <div className="flex items-center mb-1 md:mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-center">All-Time Winners</h1>
          </div>
          <p className="text-sm md:text-lg text-gray-600 dark:text-gray-400">
            Complete history of our auction winners
          </p>
        </div>

        <div className="bg-white dark:bg-[#131313] rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-[#131313]">
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
              <tbody className="bg-white dark:bg-[#131313] divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
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
                    <tr key={winner.token_id.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm font-medium text-center">
                        <Link href={`/auction/${winner.token_id}`} className="hover:underline">
                          #{winner.token_id.toString()}
                        </Link>
                      </td>
                      <td className="px-1 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        <div className="flex items-center">
                          {getProfilePicture(winner) ? (
                            <img 
                              src={getProfilePicture(winner)!} 
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
                              className={`truncate ${(winner.twitter_username || winner.farcaster_username) ? 'hover:underline cursor-pointer' : ''}`}
                              onClick={(e) => (winner.twitter_username || winner.farcaster_username) ? handleNameClick(winner, e as React.MouseEvent) : undefined}
                            >
                              {getDisplayName(winner)}
                            </span>
                            {winner.twitter_username ? (
                              <div className="hidden md:block flex-shrink-0 mt-1 mb-1">
                                <XLogo 
                                  size="md" 
                                  username={winner.twitter_username} 
                                  className="ml-1 opacity-80 hover:opacity-100"
                                />
                              </div>
                            ) : winner.farcaster_username && (
                              <div className="hidden md:block flex-shrink-0 mt-1 mb-1">
                                <WarpcastLogo 
                                  size="md" 
                                  username={winner.farcaster_username} 
                                  className="ml-1 opacity-80 hover:opacity-100"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        <div className="font-mono">
                          ${Math.floor(winner.usd_value || 0).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-0 md:px-6 py-1 md:py-4 whitespace-nowrap text-xs md:text-sm">
                        {winner.url ? (
                          <a 
                            href={winner.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center hover:underline text-[#0000FF] dark:text-[#00FF00] max-w-[100px] md:max-w-[300px] truncate"
                            onClick={(e) => handleExternalLink(e, winner.url!)}
                          >
                            <span className="truncate">{winner.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
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
            onClick={(e) => handleExternalLink(e, "https://x.com/QRcoindotfun")}
          >
            <XLogo type="footer" />
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
            onClick={(e) => handleExternalLink(e, "https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0")}
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
            onClick={(e) => handleExternalLink(e, "https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base")}
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
        <div className="flex items-center justify-center gap-4 mt-2 md:mr-5.5 mr-[20px]">
          <Link
            href="/terms-of-use"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Terms of Service
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px]">•</span>
          <Link
            href="/privacy-policy"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Privacy Policy
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px] flex items-center h-8">•</span>
          <Link
            href="/support"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Support
          </Link>
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
    </main>
  );
} 