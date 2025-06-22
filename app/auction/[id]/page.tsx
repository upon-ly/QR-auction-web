/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuctionNavigation } from "@/components/auction-navigation";
import { QRPage } from "@/components/QRPage";
import { AuctionDetails } from "@/components/auction-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useFetchAuctions, getLatestV3AuctionId } from "@/hooks/useFetchAuctions";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { toast } from "sonner";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "@/components/SafetyDialog";
import { useFetchAuctionSettings } from "@/hooks/useFetchAuctionSettings";
import { useAuctionEvents } from "@/hooks/useAuctionEvents";
import { Button } from "@/components/ui/button";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";
import { WinnerAnnouncement } from "@/components/WinnerAnnouncement";
import { UniswapWidget } from "@/components/ui/uniswap-widget";
import Link from "next/link";
import { formatURL } from "@/utils/helperFunctions";
import BidStats from "@/components/BidStats";
import { EndorsementsCarousel } from "@/components/EndorsementsCarousel";
import styles from "./AuctionPageDesktopText.module.css";
import { frameSdk } from "@/lib/frame-sdk-singleton";
import { AuctionProvider } from "@/providers/provider";
import { useLinkVisit } from "@/providers/LinkVisitProvider";
import { useAuctionImage } from "@/hooks/useAuctionImage";
import { removeAuctionImageOverride } from "@/utils/auctionImageOverrides";
import { CLICK_SOURCES } from "@/lib/click-tracking";
import { clearAllAuctionCaches } from "@/hooks/useFetchAuctionDetailsSubgraph";

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
  getAuctionCache: (): { latestAuctionId: number, latestV3AuctionId: number } => {
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
        latestV3AuctionId 
      }));
    } catch (e) {
      console.warn('Error updating localStorage cache:', e);
    }
  }
};

interface SettingsResponse {
  data: Array<{
    urlString: string;
  }>;
}

const EARLIEST_AUCTION_ID = 1;

// Helper function to create tracked redirect URL
const createTrackedRedirectUrl = (clickSource: string) => {
  return `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(clickSource)}`;
};

export default function AuctionPage() {
  const params = useParams();
  const router = useRouter();
  const currentAuctionId = Number(params.id);

  const [mounted, setMounted] = useState(false);
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [ogUrl, setOgUrl] = useState<string>(
    `${String(process.env.NEXT_PUBLIC_DEFAULT_REDIRECT)}`
  );
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLatestAuction, setIsLatestAuction] = useState(false);
  const [latestAuctionId, setLatestAuctionId] = useState(0);
  const [latestV3AuctionId, setLatestV3AuctionId] = useState(0);
  const isFrame = useRef(false);
  const isNavigating = useRef(false);

  const isBaseColors = useBaseColors();
  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } = useSafetyDialog();
  const { auctions, refetch: refetchAuctions, forceRefetch: forceRefetchAuctions } = useFetchAuctions(BigInt(currentAuctionId));
  const { refetchSettings } = useFetchAuctionSettings(BigInt(currentAuctionId));

  // Check if this is auction #22 from v1 contract
  const isAuction22 = currentAuctionId === 22;
  
  // Check if this is auction #61 from v2 contract
  const isAuction61 = currentAuctionId === 61;

  // Check if we're in Farcaster frame context on mount
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrame.current = !!context?.user;
        console.log("Frame context check in AuctionPage:", isFrame.current ? "Running in frame" : "Not in frame");
      } catch (frameError) {
        console.log("Not in a Farcaster frame context:", frameError);
        isFrame.current = false;
      }
    }
    
    checkFrameContext();
  }, []);
  
  // Function to handle URL opening, always using safety dialog first
  const handleFrameOpenUrl = async (url: string, e?: React.MouseEvent, noDialog?: boolean) => {
    // If event provided, prevent default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Always try to show the safety dialog first
    const showingDialog = noDialog ? false : openDialog(url);
    
    // If the dialog isn't showing (user disabled it), handle direct navigation
    if (!showingDialog) {
      if (isFrame.current) {
        try {
          await frameSdk.redirectToUrl(url);
        } catch (error) {
          console.error("Error opening URL in frame:", error);
        }
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };

  // Update the cached latest auction ID whenever we have auctions data
  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const latestId = Number(lastAuction.tokenId);
      setLatestAuctionId(latestId);
      
      // Get the latest V3 auction ID
      const latestV3Id = getLatestV3AuctionId(auctions);
      setLatestV3AuctionId(latestV3Id);
      
      // Check if current auction is the latest (of any version)
      setIsLatestAuction(currentAuctionId === latestId);
      
      setIsLoading(false);
      
      // Update the cached latest auction ID if this is indeed the latest
      if (latestId > 0) {
        safeLocalStorage.updateAuctionCache(latestId, latestV3Id);
      }
    } else if (auctions) {
      setIsLoading(false);
    }
  }, [auctions, currentAuctionId]);

  const fetchOgImage = useCallback(async () => {
    try {
      // Special case for auction #62 - use data from auction #61 (V2 contract)
      const isAuction62 = currentAuctionId === 62;
      
      if (isAuction62) {
        console.log('Special case: Fetching auction #61 URL for auction #62');
        // Define the V2 contract URL/data instead of using current auction
        const hardcodedUrl = "https://www.clanker.world/";
        setOgUrl(hardcodedUrl);
        
        try {
          const ogRes = await fetch(`/api/og?url=${encodeURIComponent(hardcodedUrl)}`);
          const data = await ogRes.json();
          if (data.error || !data.image) {
            setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
          } else {
            setOgImage(data.image);
          }
        } catch (err) {
          setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        }
        return;
      }
      
      // Normal case - fetch current auction settings
      const res = await refetchSettings() as SettingsResponse;
      const url = res?.data[6]?.urlString ?? `${process.env.NEXT_PUBLIC_DEFAULT_REDIRECT}`;

      try {
        const ogRes = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
        const data = await ogRes.json();
        if (data.error || !data.image) {
          setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        } else {
          setOgImage(data.image);
        }
        setOgUrl(url);
      } catch (err) {
        setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        setOgUrl(url);
      }
    } catch (err) {
      console.error("Error fetching OG image:", err);
    }
  }, [refetchSettings, currentAuctionId]);

  useEffect(() => {
    if (isLatestAuction) {
      fetchOgImage();
    } else {
      setOgImage(null);
      setOgUrl('');
    }
  }, [isLatestAuction, fetchOgImage]);

  const handlePrevious = () => {
    if (currentAuctionId > EARLIEST_AUCTION_ID) {
      router.push(`/auction/${currentAuctionId - 1}`);
    }
  };

  const handleNext = () => {
    if (!isLatestAuction || currentAuctionId === 22 || currentAuctionId === 61) {
      router.push(`/auction/${currentAuctionId + 1}`);
    }
  };

  const handleLatest = () => {
    if (latestV3AuctionId > 0) {
      // Always navigate to the latest V3 auction (62+)
      router.push(`/auction/${latestV3AuctionId}`);
    } else if (latestAuctionId > 0) {
      // Fallback to latest auction of any version if no V3 auctions exist
      router.push(`/auction/${latestAuctionId}`);
    } else {
      console.warn("Latest auction ID not available yet.");
    }
  };

  useAuctionEvents({
    tokenId: BigInt(currentAuctionId),
    onAuctionBid: (tokenId, bidder, amount, extended, endTime, urlString, name) => {
      if (Number(tokenId) === currentAuctionId) {
        // Force refresh the auction data to bypass cache
        forceRefetchAuctions();
      }
    },
    onAuctionSettled: async (tokenId, winner, amount, urlString, name) => {
      console.log(`[AuctionSettled] Auction #${tokenId} settled, winner: ${winner}`);
      
      // Check if we're using test subgraph
      const useTestSubgraph = process.env.NEXT_PUBLIC_USE_TEST_SUBGRAPH === 'true';
      
      if (useTestSubgraph) {
        console.log(`[AuctionSettled] Using test subgraph - skipping image override clearing and winner database insertion`);
      }
      
      // Clear the auction image override for the settled auction (cleanup) - skip if using test subgraph
      if (!useTestSubgraph) {
        try {
          const cleared = await removeAuctionImageOverride(Number(tokenId));
          if (cleared) {
            console.log(`[AuctionSettled] Successfully cleared auction image override for auction #${tokenId}`);
          } else {
            console.log(`[AuctionSettled] No auction image override to clear for auction #${tokenId}`);
          }
        } catch (error) {
          console.error(`[AuctionSettled] Error clearing auction image override for auction #${tokenId}:`, error);
        }
      }
      
      // Automatically insert winner into database - skip if using test subgraph
      if (!useTestSubgraph) {
        try {
          console.log(`[AuctionSettled] Adding winner to database for auction #${tokenId}`);
        
        // Determine auction version and calculate USD value
        const isV3Auction = Number(tokenId) >= 62;
        const isV2Auction = Number(tokenId) >= 23 && Number(tokenId) <= 61;
        const isV1Auction = Number(tokenId) <= 22;
        
        let usdValue = null;
        if (isV3Auction) {
          // V3 uses USDC, so amount is already in USD (divide by 1e6 for decimals)
          usdValue = Number(amount) / 1e6;
        } else if (isV2Auction || isV1Auction) {
          // For V1/V2, we'd need to fetch ETH/QR price to convert to USD
          // For now, we'll leave USD value as null for these older auctions
          usdValue = null;
        }
        
        // Resolve usernames and identity data
        let twitterUsername = null;
        let farcasterUsername = null;
        let displayName = null;
        
        try {
          // Check if we're in a frame context to determine likely source
          const frameContext = await frameSdk.getContext();
          const isFrameContext = !!frameContext?.user;
          console.log(`[AuctionSettled] Context detected: ${isFrameContext ? 'Frame/Miniapp' : 'Website'}`);
          
          // Always try to resolve Farcaster data from winner address
          const { getFarcasterUser } = await import('@/utils/farcaster');
          const farcasterUser = await getFarcasterUser(winner);
          
          if (farcasterUser) {
            farcasterUsername = farcasterUser.username;
            displayName = farcasterUser.displayName || null;
            console.log(`[AuctionSettled] Resolved Farcaster data - username: ${farcasterUsername}, displayName: ${displayName}`);
          }
          
          // For website context, the name field is the Twitter username
          if (!isFrameContext && name) {
            twitterUsername = name;
            console.log(`[AuctionSettled] Twitter username from bid: ${twitterUsername}`);
          }
          
        } catch (contextError) {
          console.log(`[AuctionSettled] Error resolving user data:`, contextError);
          
          // Fallback: if we have a name from the bid, use it as twitter username
          if (name) {
            twitterUsername = name;
          }
        }
        
        // Prepare winner data with all available fields
        const winnerData = {
          tokenId: tokenId.toString(),
          winnerAddress: winner,
          amount: amount.toString(),
          url: urlString || null,
          displayName: displayName,
          farcasterUsername: farcasterUsername,
          twitterUsername: twitterUsername ? twitterUsername.substring(0, 50) : null,
          usdValue: usdValue,
          isV1Auction: isV1Auction,
          // These fields would need additional resolution:
          // basename: null, // Would need ENS/Basename lookup
          // ensName: null,  // Would need ENS lookup
        };
        
        console.log(`[AuctionSettled] Sending winner data:`, winnerData);
        
        // Add winner to database
        const winnerResponse = await fetch('/api/winners', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(winnerData)
        });
        
        if (winnerResponse.ok) {
          const result = await winnerResponse.json();
          console.log(`[AuctionSettled] Successfully added winner to database:`, result);
        } else {
          const errorText = await winnerResponse.text();
          console.error(`[AuctionSettled] Failed to add winner to database:`, errorText);
        }
        } catch (error) {
          console.error(`[AuctionSettled] Error adding winner to database:`, error);
        }
      }
      
      // Clear social links for settled auction - skip if using test subgraph
      if (!useTestSubgraph) {
        try {
          console.log(`[AuctionSettled] Clearing social links for auction #${tokenId}`);
          
          const socialLinksResponse = await fetch('/api/social-links', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (socialLinksResponse.ok) {
            console.log(`[AuctionSettled] Successfully cleared social links`);
          } else {
            const errorText = await socialLinksResponse.text();
            console.error(`[AuctionSettled] Failed to clear social links:`, errorText);
          }
        } catch (error) {
          console.error(`[AuctionSettled] Error clearing social links:`, error);
        }
      }
      
      // Clear all auction caches to ensure fresh data
      clearAllAuctionCaches();
      
      forceRefetchAuctions();
      if (Number(tokenId) === latestAuctionId && isLatestAuction) {
        fetchOgImage();
      }
    },
    onAuctionCreated: (tokenId) => {
      console.log(`[AuctionCreated] New auction #${tokenId} created`);
      
      forceRefetchAuctions().then(() => {
        const newLatestId = Number(tokenId);
        
        // Check if this is a V3 auction (ID >= 62)
        const isV3Auction = newLatestId >= 62;
        
        // Update the latest V3 auction ID if this is a V3 auction
        let updatedV3AuctionId = latestV3AuctionId;
        if (isV3Auction && newLatestId > latestV3AuctionId) {
          updatedV3AuctionId = newLatestId;
          setLatestV3AuctionId(newLatestId);
        }
        
        // Update the cached auction data
        safeLocalStorage.updateAuctionCache(newLatestId, updatedV3AuctionId);
        
        // Only navigate if we're currently viewing the latest auction or the previous auction
        // This prevents navigation from happening on other pages
        if ((isLatestAuction || currentAuctionId === newLatestId - 1) && !isNavigating.current) {
          // Set flag to prevent duplicate navigation
          isNavigating.current = true;
          
          // Clear cache for the new auction to ensure fresh data
          const targetAuctionId = (isV3Auction || updatedV3AuctionId === 0) ? newLatestId : updatedV3AuctionId;
          clearAllAuctionCaches();
          
          // Only redirect to new auction if it's a V3 auction or we don't have V3 auctions yet
          if (isV3Auction || updatedV3AuctionId === 0) {
            console.log(`[AuctionCreated] Navigating to new auction #${newLatestId}`);
            router.push(`/auction/${newLatestId}`);
          } else {
            // If not a V3 auction but we have V3 auctions, stay on latest V3
            console.log(`[AuctionCreated] Navigating to latest V3 auction #${updatedV3AuctionId}`);
            router.push(`/auction/${updatedV3AuctionId}`);
          }
          
          // Reset navigation flag after a short delay
          setTimeout(() => {
            isNavigating.current = false;
          }, 1000);
        } else {
          console.log(`[AuctionCreated] Not navigating - current auction is #${currentAuctionId}`);
        }
        
        fetchOgImage();
      });
    },
  });

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };

  // Get the winning image for the auction (using override if available, with OG fallback)
  const { data: auctionImageData, isLoading: isAuctionImageLoading } = useAuctionImage(
    currentAuctionId, 
    ogUrl, // Pass the OG URL for fallback
    ogImage || `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
  );
  
  const currentWinningImage = auctionImageData?.imageUrl;
  
  // Update isVideo state when auction image data changes
  useEffect(() => {
    if (auctionImageData) {
      setIsVideo(auctionImageData.isVideo);
    }
  }, [auctionImageData]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pageContent = (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto mt-3 md:mt-0 lg:mt-0">
        <div className="md:hidden text-center w-full mb-1">
            <p className="font-bold text-md md:text-xl">SAME QR. NEW WEBSITE. EVERY DAY.</p>
            <p className="text-sm md:text-base">Win the auction to choose where it points next!</p>
        </div>
        <div className="flex flex-col justify-center items-center gap-9">

          <div className="grid md:grid-cols-2 gap-2 md:gap-8 w-full">
            <div
              className={clsx(
                "flex flex-col justify-center px-8 pb-6 pt-6 md:p-8 lg:p-8 h-[220px] md:h-[345px] rounded-lg relative",
                isBaseColors ? "bg-primary" : "bg-white border"
              )}
            >
              {/* Desktop-only: Heading and Subheading for QR card, overlayed */}
              <div className="hidden md:block">
                <div className={styles.desktopHeading}>SAME QR. NEW WEBSITE. EVERY DAY.</div>
                <div className={styles.desktopSubheading}>Win the auction to choose where it points next!</div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.QR_ARROW), e, true);
                }}
                className={`absolute top-3 right-3 p-1.5 rounded-full z-10 ${
                  isBaseColors 
                    ? "bg-white/20 hover:bg-white/30" 
                    : "bg-gray-100 hover:bg-gray-200"
                } transition-colors`}
                aria-label="Open redirect link"
              >
                <ExternalLink className={`h-5 w-5 ${isBaseColors ? "text-white" : "text-black"}`} />
              </button>
              
              <div className="inline-flex flex-col items-center">
                <QRPage />
              </div>
            </div>

            {!isLoading && currentAuctionId > 0 ? (
              <AuctionDetails
                id={currentAuctionId}
                onPrevious={handlePrevious}
                onNext={handleNext}
                isLatest={isLatestAuction}
              />
            ) : (
              <Skeleton className="flex-1 h-[368px]" />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:gap-8 w-full">
            <div className="flex flex-col w-full">
              {/* Mobile Winner Display - displayed as block on mobile, hidden on desktop */}
              {isLatestAuction && currentWinningImage && ogUrl && !isAuction22 && !isAuction61 && (
                <div className="block md:hidden">
                  <div className="flex flex-col justify-center items-center w-[calc(100vw-32px)] max-w-[376px] mx-auto gap-1">
                    <label className="font-semibold text-xl md:text-2xl flex items-center justify-center w-full">
                      <span className="md:hidden whitespace-nowrap">🏆🏆🏆🏆</span>
                      <span className="mx-2">Today&apos;s Winner</span>
                      <span className="md:hidden whitespace-nowrap">🏆🏆🏆🏆</span>
                    </label>
                    <div className={clsx(
                      "border rounded-lg shadow-none flex flex-col w-full overflow-hidden",
                      isBaseColors ? "bg-primary/5" : "bg-white dark:bg-black"
                    )}
                    style={{ boxShadow: 'none' }}>
                      {/* Image/Video with no padding */}
                      <div className="w-full bg-white aspect-[2/1] overflow-hidden">
                        {isVideo ? (
                          <video
                            src={currentWinningImage}
                            poster={currentAuctionId === 77 ? "https://i.postimg.cc/85DwR5m5/74winner.jpg" : undefined}
                            controls
                            playsInline
                            className="object-cover w-full h-full cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_IMAGE), e, true);
                            }}
                          />
                        ) : (
                          <img
                            src={currentWinningImage}
                            alt="Open Graph"
                            className="object-cover w-full h-full cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_IMAGE), e, true);
                            }}
                          />
                        )}
                      </div>
                      {/* Text content with padding */}
                      <div className="flex flex-col items-center p-4">
                        <span className={clsx(isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]", "font-normal")}>
                          The QR now points to:
                        </span>
                        <div className="w-full flex justify-center">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_LINK), e, true);
                            }}
                            className="inline-flex items-center hover:opacity-80 transition-opacity max-w-full"
                            title={ogUrl}
                            aria-label="redirect"
                          >
                            <span className="truncate font-medium">
                              {formatURL(ogUrl, true, true, 280)}
                            </span>
                            <ExternalLink className="ml-1 h-6 w-3.5 flex-shrink-0" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Desktop Winner Display - hidden on mobile, displayed on desktop */}
              {isLatestAuction && currentWinningImage && ogUrl && !isAuction22 && !isAuction61 && (
                <div className="hidden md:flex flex-col justify-center items-center gap-1 w-full max-w-[376px] mx-auto">
                  <label className="font-semibold text-xl md:text-2xl flex items-center justify-center w-full">
                    <span className="hidden md:inline">🏆</span>
                    <span className="mx-2">Today&apos;s Winner</span>
                    <span className="hidden md:inline">🏆</span>
                  </label>
                  <div className={clsx(
                    "border rounded-lg shadow-none flex flex-col w-full overflow-hidden",
                    isBaseColors ? "bg-primary/5" : "bg-white dark:bg-black"
                  )}
                  style={{ boxShadow: 'none' }}>
                    {/* Image/Video with no padding */}
                    <div className="w-full bg-white aspect-[2/1] overflow-hidden">
                      {isVideo ? (
                        <video
                          src={currentWinningImage}
                          poster={currentAuctionId === 77 ? "https://i.postimg.cc/85DwR5m5/74winner.jpg" : undefined}
                          controls
                          playsInline
                          className="object-cover w-full h-full cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_IMAGE), e, true);
                          }}
                        />
                      ) : (
                        <img
                          src={currentWinningImage}
                          alt="Open Graph"
                          className="object-cover w-full h-full cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_IMAGE), e, true);
                          }}
                        />
                      )}
                    </div>
                    {/* Text content with padding */}
                    <div className="flex flex-col items-center p-4">
                      <span className={clsx(isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]", "font-normal")}>
                        The QR now points to:
                      </span>
                      <div className="w-full flex justify-center">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleFrameOpenUrl(createTrackedRedirectUrl(CLICK_SOURCES.WINNER_LINK), e, true);
                          }}
                          className="inline-flex items-center hover:opacity-80 transition-opacity max-w-full"
                          title={ogUrl}
                          aria-label="redirect"
                        >
                          <span className="truncate font-medium">
                            {formatURL(ogUrl, true, false, 350)}
                          </span>
                          <ExternalLink className="ml-1 h-6 w-3.5 flex-shrink-0" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* BidStats for desktop - under Today's Winner */}
                  {/* TODO: Add BidStats back in when ready with v3 subgraph */}
                  {/* <div className="mt-4 w-full max-w-[376px]">
                    <h2 className="font-semibold text-xl md:text-2xl text-center mb-1">
                      <span className="">Bid Counter</span>
                    </h2>
                    <div className="h-[190px]">
                      <BidStats />
                    </div>
                  </div> */}
                </div>
              )}
            </div>

            {/* <div className="hidden md:flex flex-col gap-1">
              {isLatestAuction && !isAuction22 && !isAuction61 && ( */}
                <>
                  {/* <h2 className="font-semibold text-xl md:text-2xl text-center">
                    <span className="">Buy USDC</span>
                  </h2> */}
                  {/* <div style={{ height: "510px" }} className="overflow-hidden rounded-lg w-full mx-auto">
                    <LiFiWidgetComponent 
                      inputCurrency="NATIVE"
                      outputCurrency="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // USDC on Base
                    />
                  </div> */}
                  {/* <div style={{ height: "510px" }}>
                    <UniswapWidget />
                  </div> */}
                </>
              {/* )} }
            { </div> */}
          </div>

          {(!isLatestAuction || isAuction22 || isAuction61) && currentAuctionId > 0 && (
            <WinnerAnnouncement auctionId={currentAuctionId} />
          )}
          
          {/* Mobile LiFi Widget */}
          {/* {isLatestAuction && !isAuction22 && (
            <div className="md:hidden w-full">
              <h2 className="font-semibold text-xl text-center mb-1">
                <span className="">Buy USDC</span>
              </h2>
              <div style={{ height: "570px" }} className="overflow-hidden rounded-lg w-full max-w-[95vw] mx-auto sm:max-w-sm">
                <LiFiWidgetComponent 
                  inputCurrency="NATIVE"
                  outputCurrency="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // USDC on Base
                />
              </div>
            </div>
          )} */}

          {/* Mobile Uniswap Widget */}
          {/* {isLatestAuction && !isAuction22 && !isAuction56 && (
            <div className="md:hidden w-full">
              <h2 className="font-semibold text-xl text-center mb-1">
                <span className="">Buy USDC</span>
              </h2>
              <div style={{ height: "570px" }}>
                <UniswapWidget />
              </div>
            </div>
          )} */}
          
          {/* BidStats for mobile - centered */}
          {/* <div className="md:hidden mx-auto w-full">
            <h2 className="font-semibold text-xl text-center mb-1">
              <span className="">Bid Counter</span>
            </h2>
            <BidStats />
          </div> */}
        </div>
      </div>

      {/* Love Carousel - add this before the footer */}
      {isLatestAuction && !isAuction61 && (
        <div className="md:mt-0">
          <EndorsementsCarousel />
        </div>
      )}

      <footer className="lg:mt-10 md:mt-10 mt-10 text-center flex flex-col items-center">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://x.com/QRcoindotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="X (formerly Twitter)"
            onClick={(e) => {
              if (isFrame.current) {
                e.preventDefault();
                handleFrameOpenUrl("https://x.com/qrcoindotfun", e, true);
              }
            }}
          >
            <XLogo 
              type="footer"
            />
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
            onClick={(e) => {
              if (isFrame.current) {
                e.preventDefault();
                handleFrameOpenUrl("https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0", e, true);
              }
            }}
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
            onClick={(e) => {
              if (isFrame.current) {
                e.preventDefault();
                handleFrameOpenUrl("https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base", e, true);
              }
            }}
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

      <SafetyDialog
        isOpen={isOpen}
        onClose={closeDialog}
        targetUrl={pendingUrl || ""}
        onContinue={() => {
          // When continuing from safety dialog, use popup button as the click source
          // since we can't determine the exact source that triggered the dialog
          const trackedUrl = createTrackedRedirectUrl(CLICK_SOURCES.POPUP_BUTTON);
          
          // Close the dialog first
          closeDialog();
          
          // Then navigate using handleFrameOpenUrl for frame compatibility
          handleFrameOpenUrl(trackedUrl, undefined, true);
        }}
      />
    </main>
  );

  return (
    <AuctionProvider
      auctionId={currentAuctionId}
      winningUrl={ogUrl}
      winningImage={currentWinningImage || ""}
    >
      {pageContent}
    </AuctionProvider>
  );
} 