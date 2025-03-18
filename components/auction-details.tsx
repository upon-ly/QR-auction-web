/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import { useCountdown } from "@/hooks/useCountdown";
import { BidHistoryDialog } from "./bid-history-dialog";
import { formatEther } from "viem";
import { HowItWorksDialog } from "./HowItWorksDialog";

import { useFetchSettledAuc } from "@/hooks/useFetchSettledAuc";
import { useFetchAuctionDetails } from "@/hooks/useFetchAuctionDetails";
import { useFetchAuctionSettings } from "@/hooks/useFetchAuctionSettings";
import { useWriteActions } from "@/hooks/useWriteActions";
import { waitForTransactionReceipt } from "@wagmi/core";
import { toast } from "sonner";
import { config } from "@/config/config";
import { BidForm } from "@/components/bid-amount-view";
import { WinDetailsView } from "@/components/WinDetailsView";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "wagmi";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "./SafetyDialog";
import useEthPrice from "@/hooks/useEthPrice";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { getFarcasterUser } from "@/utils/farcaster";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { useAuctionEvents, registerTransaction } from "@/hooks/useAuctionEvents";
import { useBaseColors } from "@/hooks/useBaseColors";
interface AuctionDetailsProps {
  id: number;
  onPrevious: () => void;
  onNext: () => void;
  isLatest: boolean;
}

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
};

type NameInfo = {
  displayName: string;
  farcasterUsername: string | null;
  basename: string | null;
  pfpUrl: string | null;
};

export function AuctionDetails({
  id,
  onPrevious,
  onNext,
  isLatest,
}: AuctionDetailsProps) {
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [settledAuctions, setSettledAcustions] = useState<AuctionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bidderNameInfo, setBidderNameInfo] = useState<NameInfo>({
    displayName: "",
    farcasterUsername: null,
    basename: null,
    pfpUrl: null
  });

  const { fetchHistoricalAuctions: auctionsSettled } = useFetchSettledAuc();
  const { refetch, auctionDetail } = useFetchAuctionDetails();
  const { refetchSettings, settingDetail } = useFetchAuctionSettings();

  const { settleTxn } = useWriteActions({ tokenId: BigInt(id) });
  const { isConnected, address } = useAccount();
  const { time, isComplete } = useCountdown(
    auctionDetail?.endTime ? Number(auctionDetail.endTime) : 0
  );
  const isBaseColors = useBaseColors();

  const {
    ethPrice: price,
    isLoading: isPriceLoading,
    isError: isPriceError,
  } = useEthPrice();

  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } =
    useSafetyDialog();

  const currentSettledAuction = settledAuctions.find((val) => {
    return Number(val.tokenId) === id;
  });

  const ethBalance = Number(formatEther(auctionDetail?.highestBid ?? 0n));
  const ethPrice = price?.ethereum?.usd ?? 0;
  const usdBalance = ethBalance * ethPrice;

  const handleSettle = useCallback(async () => {
    if (!isComplete) {
      return;
    }

    if (!isConnected) {
      toast.error("Connect a wallet");
      return;
    }

    if (
      ![
        "0x5B759eF9085C80CCa14F6B54eE24373f8C765474",
        "0x5371d2E73edf765752121426b842063fbd84f713",
        "0x09928ceBB4c977C5e5Db237a2A2cE5CD10497CB8",
      ].includes(address as string)
    ) {
      toast.error("Only Admins can settle auction");
      return;
    }

    try {
      const hash = await settleTxn();
      
      // Register the transaction hash to prevent duplicate toasts
      registerTransaction(hash);

      const transactionReceiptPr = waitForTransactionReceipt(config, {
        hash: hash,
      });

      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: (data: any) => {
          return "New Auction Created";
        },
        error: (data: any) => {
          return "Failed to settle and create new auction";
        },
      });
    } catch (error) {
      console.error(error);
    }
  }, [isComplete, id, auctionDetail, isConnected, address, settleTxn]);

  const updateDetails = async () => {
    await refetch();
    await refetchSettings();
  };

  const openBid = () => {
    setShowBidHistory(true);
  };

  useEffect(() => {
    if (id) {
      const refetchDetails = async () => {
        await refetch();
        await refetchSettings();

        if (auctionDetail !== undefined) {
          setIsLoading(false);
        }
      };
      setIsLoading(true);
      refetchDetails();
    }
  }, [id, auctionDetail?.tokenId]);

  // Update document title with current bid
  useEffect(() => {
    // Start with default title
    document.title = "QR";
    
    // Only proceed if we have auction data and it's not loading
    if (!auctionDetail || isLoading) {
      return;
    }
    
    // Only show special title for active auctions with bids
    const now = Math.floor(Date.now() / 1000);
    const isAuctionActive = 
      !auctionDetail.settled && 
      auctionDetail.startTime > 0 && 
      auctionDetail.endTime > now && 
      auctionDetail.highestBid > 0n;
    
    if (isAuctionActive) {
      const currentBid = Number(formatEther(auctionDetail.highestBid));
      const usdValue = currentBid * (price?.ethereum?.usd || 0);
      document.title = `QR $${usdValue.toFixed(2)} - ${bidderNameInfo.displayName}`;
    }
  }, [auctionDetail, price?.ethereum?.usd, bidderNameInfo.displayName, isLoading]);

  useEffect(() => {
    const ftSetled = async () => {
      const data = await auctionsSettled();
      if (data !== undefined) {
        setSettledAcustions(data);
      }
    };

    ftSetled();
  }, [isComplete]);

  useEffect(() => {
    const fetchBidderName = async () => {
      if (!auctionDetail?.highestBidder) return;
      
      // Make sure we're using a valid Ethereum address (0x...)
      const bidderAddress = auctionDetail.highestBidder;
      
      // Fetch Farcaster username from the API
      const farcasterUser = await getFarcasterUser(bidderAddress);
      
      // Format the address display
      const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      };
      
      // We can use the highestBidderName that's already fetched in useFetchAuctionDetails
      // since getName already handles the priority between basename and ENS name
      const name = auctionDetail.highestBidderName;
      
      // Prioritize names: Farcaster > getName result > formatted address
      let displayName;
      if (farcasterUser?.username) {
        // Quick temp fix - replace !217978 with softwarecurator
        const username = farcasterUser.username === "!217978" ? "softwarecurator" : farcasterUser.username;
        displayName = `@${username}`;
      } else if (name) {
        // Quick temp fix - replace !217978 with softwarecurator
        displayName = name === "!217978" ? "softwarecurator" : name;
      } else if (bidderAddress.startsWith('0x')) {
        displayName = formatAddress(bidderAddress);
      } else {
        displayName = bidderAddress; // Fallback to whatever we have
      }
      
      // Update bidder name info with properly typed state update
      setBidderNameInfo({
        displayName,
        farcasterUsername: farcasterUser?.username === "!217978" ? "softwarecurator" : (farcasterUser?.username || null),
        basename: name === "!217978" ? "softwarecurator" : (name || null),
        pfpUrl: farcasterUser?.pfpUrl || null
      });
    };

    if (auctionDetail?.highestBidder) {
      fetchBidderName();
    }
  }, [auctionDetail]);

  // Use the auction events hook to listen for real-time updates
  useAuctionEvents({
    onAuctionBid: (tokenId, bidder, amount, extended, endTime) => {
      // Only update if this event is for the current auction
      if (tokenId === BigInt(id)) {
        console.log(`Real-time update: New bid on auction #${id}`);
        // Update auction details when a new bid is placed
        refetch();
      }
    },
    onAuctionSettled: (tokenId, winner, amount) => {
      // Only update if this event is for the current auction
      if (tokenId === BigInt(id)) {
        console.log(`Real-time update: Auction #${id} settled`);
        // Update auction details when the auction is settled
        refetch();
      }
    },
    onAuctionCreated: (tokenId, startTime, endTime) => {
      console.log(`Real-time update: New auction #${tokenId} created`);
      // The main page already handles updating to the latest auction
      // We don't need to call onNext() here as it causes double navigation
      // The parent component (page.tsx) already updates currentAuctionId
    },
    showToasts: false // Disable toasts in this component as they're already shown in the main page
  });

  // Format the end time in local timezone with abbreviated timezone name
  const formatEndTime = () => {
    if (!auctionDetail?.endTime) return "";
    
    const endDate = new Date(Number(auctionDetail.endTime) * 1000);
    
    // Format time as "11:45 AM"
    const timeStr = endDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    // Get timezone abbreviation using a more direct approach
    // This gives us reliable abbreviations like ET, CT, PT, IST, etc.
    const tzAbbr = (() => {
      // Extract timezone abbreviation from date string
      const tzMatch = endDate.toString().match(/\(([^)]+)\)/);
      if (!tzMatch) return '';
      
      // If it has spaces (like "Eastern Daylight Time"), take first letter of each word
      const tz = tzMatch[1];
      if (tz.includes(' ')) {
        return tz.split(' ').map(word => word[0]).join('');
      }
      
      // Already an abbreviation like "GMT"
      return tz;
    })();
    
    return `ends @ ${timeStr} ${tzAbbr}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="flex flex-row justify-between items-center w-full">
          <div className="inline-flex justify-start items-center gap-2">
            <h1 className="text-3xl font-bold">Auction #{id}</h1>
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full border-none transition-colors ${
                isLatest
                  ? "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-800/50" 
                  : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30"
              } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground" : ""}`}
              onClick={onPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" 
              size="icon"
              className={`rounded-full border-none transition-colors ${
                isLatest
                  ? `bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30 opacity-50 cursor-not-allowed ${isBaseColors ? "bg-primary/90 hover:bg-primary/90 hover:text-foreground" : ""}`
                  : `bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30 ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground" : ""}`
              }`}
              onClick={onNext}
              disabled={isLatest}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Info
            size={30}
            onClick={() => setShowHowItWorks(true)}
            className={`${isBaseColors ? "text-foreground" : ""} cursor-pointer`}
          />
        </div>
        {isLoading && (
          <div className="flex flex-col space-y-3">
            <Skeleton className="h-[125px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        )}

        {auctionDetail &&
          Number(auctionDetail.tokenId) === id &&
          !isLoading && (
            <>
              {!auctionDetail.settled ? (
                <>
                  <div className="flex flex-row justify-between gap-8">
                    <div className="space-y-1">
                      <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Current bid</div>
                      <div className="flex flex-row justify-center items-center gap-1">
                        <div className="text-xl md:text-2xl font-bold">
                          {Number(formatEther(
                            auctionDetail?.highestBid
                              ? auctionDetail.highestBid
                              : 0n
                          )).toLocaleString('en-US', {
                            maximumFractionDigits: 3,
                            minimumFractionDigits: 0
                          })}{" "}
                          ETH
                        </div>
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>
                          {usdBalance !== 0 && `($${usdBalance.toFixed(0)})`}
                        </div>
                      </div>
                    </div>
                    {!isComplete && (
                      <div className="space-y-1">
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} text-right`}>
                          Time left
                        </div>
                        <div className={`${isBaseColors ? "text-foreground" : ""} text-right text-xl md:text-2xl font-bold whitespace-nowrap`}>
                          {time}
                        </div>
                        <div className={`${isBaseColors ? "text-foreground/80" : "text-gray-500 dark:text-gray-400"} text-right text-xs`}>
                          {formatEndTime()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {!isComplete && (
                      <BidForm
                        auctionDetail={auctionDetail}
                        settingDetail={settingDetail}
                        onSuccess={updateDetails}
                        openDialog={openDialog}
                      />
                    )}
                    {isComplete && (
                      <Button
                        className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground" : ""} px-8 h-12`}
                        onClick={handleSettle}
                      >
                        Settle and create auction
                      </Button>
                    )}

                    {auctionDetail && auctionDetail.highestBidder && (
                      <div className="flex flex-row text-sm items-start justify-between">
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} text-left flex items-center`}>
                          Highest bidder: 
                          <span className="ml-1 flex items-center">
                            {bidderNameInfo.displayName}
                            {bidderNameInfo.farcasterUsername && (
                              <WarpcastLogo 
                                size="sm" 
                                username={bidderNameInfo.farcasterUsername} 
                                className="ml-1 opacity-80 hover:opacity-100"
                              />
                            )}
                          </span>
                        </div>
                        <button
                          onClick={() => setShowBidHistory(true)}
                          className={`${isBaseColors ? "text-foreground underline" : "text-gray-600 dark:text-[#696969] underline"} text-right w-[120px]`}
                        >
                          All bids
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-gray-600 dark:text-[#696969]">Winning bid</div>
                      <div className="text-2xl font-bold">
                        {Number(formatEther(auctionDetail?.highestBid || 0n)).toLocaleString('en-US', {
                          maximumFractionDigits: 3,
                          minimumFractionDigits: 0
                        })} ETH
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 dark:text-[#696969]">Won by</div>
                      <div className="flex items-center gap-2">
                        {bidderNameInfo.pfpUrl ? (
                          <img 
                            src={bidderNameInfo.pfpUrl} 
                            alt="Profile" 
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 bg-gray-200 rounded-full" />
                        )}
                        <span className="flex items-center">
                          {bidderNameInfo.displayName}
                          {bidderNameInfo.farcasterUsername && (
                            <WarpcastLogo 
                              size="md" 
                              username={bidderNameInfo.farcasterUsername} 
                              className="ml-0.5 opacity-80 hover:opacity-100"
                            />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gray-900 hover:bg-gray-800"
                    onClick={() =>
                      window.open(auctionDetail?.qrMetadata.urlString, "_blank")
                    }
                  >
                    Visit Winning Site
                  </Button>

                  <div className="flex flex-row items-center text-sm justify-between">
                    <button
                      onClick={() => setShowBidHistory(true)}
                      className="text-gray-600 dark:text-[#696969] underline text-left w-full"
                    >
                      Prev bids
                    </button>
                    <button
                      onClick={() => setShowHowItWorks(true)}
                      className="text-gray-600 dark:text-[#696969] underline text-right w-[120px]"
                    >
                      How it works
                    </button>
                  </div>
                </>
              )}
            </>
          )}

        {auctionDetail &&
          Number(auctionDetail.tokenId) !== id &&
          !isLoading && (
            <>
              <WinDetailsView
                tokenId={currentSettledAuction?.tokenId || 0n}
                winner={currentSettledAuction?.winner || "0x"}
                amount={currentSettledAuction?.amount || 0n}
                url={currentSettledAuction?.url || ""}
                openDialog={openDialog}
                openBids={openBid}
              />
            </>
          )}
      </div>

      <BidHistoryDialog
        isOpen={showBidHistory}
        onClose={() => setShowBidHistory(false)}
        auctionId={id}
        latestId={Number(auctionDetail?.tokenId || id)}
        isComplete={isComplete}
        openDialog={openDialog}
      />

      <HowItWorksDialog
        isOpen={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />

      <SafetyDialog
        isOpen={isOpen}
        onClose={closeDialog}
        targetUrl={pendingUrl || ""}
        onContinue={handleContinue}
      />
    </div>
  );
}
