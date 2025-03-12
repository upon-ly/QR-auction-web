/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AuctionNavigation } from "@/components/auction-navigation";
import { QRPage } from "@/components/QRPage";
import { AuctionDetails } from "@/components/auction-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink } from "lucide-react";

import { useFetchAuctions } from "../hooks/useFetchAuctions";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { toast } from "sonner";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "../components/SafetyDialog";
import { SafeExternalLink } from "../components/SafeExternalLink";
import sdk, {
  AddFrame,
  FrameNotificationDetails,
  type Context,
} from "@farcaster/frame-sdk";
import { formatURL } from "@/utils/helperFunctions";
import { frameSdk } from "@/lib/frame-sdk";
import { useFetchAuctionSettings } from "@/hooks/useFetchAuctionSettings";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [sendNotificationResult, setSendNotificationResult] = useState("");

  const [added, setAdded] = useState(false);
  const [notificationDetails, setNotificationDetails] =
    useState<FrameNotificationDetails | null>(null);

  const [lastEvent, setLastEvent] = useState("");

  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogUrl, setOgUrl] = useState<string>(
    `${String(process.env.NEXT_PUBLIC_DEFAULT_REDIRECT)}`
  );

  // const [addFrameResult, setAddFrameResult] = useState("");
  // const [sendNotificationResult, setSendNotificationResult] = useState("");

  const [currentAuctionId, setCurrentAuctionId] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const { auctions } = useFetchAuctions();

  const DEFAULT_DATE = Math.floor(Date.now() / 1000);

  const LATEST_AUCTION_ID = useRef(0);
  const EARLIEST_AUCTION_ID = 1;

  const { refetchSettings, settingDetail } = useFetchAuctionSettings();

  const handlePrevious = () => {
    if (currentAuctionId > EARLIEST_AUCTION_ID) {
      setCurrentAuctionId((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentAuctionId < LATEST_AUCTION_ID.current) {
      setCurrentAuctionId((prev) => prev + 1);
    }
  };

  const handleLatest = () => {
    setCurrentAuctionId(LATEST_AUCTION_ID.current);
  };

  const currentAuction = auctions.find((val) => {
    return Number(val.tokenId) === currentAuctionId;
  });

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;

  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } =
    useSafetyDialog();

  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    toast.info("CA copied!");
  };

  const formatDate = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000); // convert to milliseconds

    // Define options for a short month, numeric day, and numeric year.
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };

    const formattedDate = date.toLocaleDateString("en-US", options);
    return formattedDate;
  };

  const sendNotification = useCallback(async () => {
    setSendNotificationResult("");
    if (!notificationDetails || !context) {
      return;
    }

    try {
      const response = await fetch("/api/send-notification", {
        method: "POST",
        mode: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context.user.fid,
          notificationDetails,
        }),
      });

      if (response.status === 200) {
        setSendNotificationResult("Success");
        return;
      } else if (response.status === 429) {
        setSendNotificationResult("Rate limited");
        return;
      }

      const data = await response.text();
      setSendNotificationResult(`Error: ${data}`);
    } catch (error) {
      setSendNotificationResult(`Error: ${error}`);
    }
  }, [context, notificationDetails]);

  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const lastAuction = auctions[auctions.length - 1];
      const lastAuctionId = Number(lastAuction.tokenId);

      // Only update if the last auction ID has changed
      if (LATEST_AUCTION_ID.current !== lastAuctionId) {
        LATEST_AUCTION_ID.current = lastAuctionId;
        setCurrentAuctionId(lastAuctionId);
        setIsLoading(lastAuctionId !== 0 ? false : true);
      }
    } else {
      setIsLoading(false);
    }
  }, [auctions.length]);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;

      if (context !== undefined) {
        setContext(context);
        setAdded(context.client.added);

        if (!context.client.added) {
          try {
            setNotificationDetails(null);

            const result = await sdk.actions.addFrame();

            if (result.notificationDetails) {
              setNotificationDetails(result.notificationDetails);
            }
            console.log(
              result.notificationDetails
                ? `Added, got notificaton token ${result.notificationDetails.token} and url ${result.notificationDetails.url}`
                : "Added, got no notification details"
            );
          } catch (error) {
            if (error instanceof AddFrame.RejectedByUser) {
              console.log(`Not added: ${error.message}`);
            }

            if (error instanceof AddFrame.InvalidDomainManifest) {
              console.log(`Not added: ${error.message}`);
            }

            console.log(`Error: ${error}`);
          }
        }
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setLastEvent(
          `frameAdded${!!notificationDetails ? ", notifications enabled" : ""}`
        );

        setAdded(true);
        if (notificationDetails) {
          setNotificationDetails(notificationDetails);
        }
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        setLastEvent(`frameAddRejected, reason ${reason}`);
      });

      sdk.on("frameRemoved", () => {
        setLastEvent("frameRemoved");
        setAdded(false);
        setNotificationDetails(null);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        setLastEvent("notificationsEnabled");
        setNotificationDetails(notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        setLastEvent("notificationsDisabled");
        setNotificationDetails(null);
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready();
    };
    if (sdk && !isSDKLoaded) {
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded]);

  useEffect(() => {
    setNotificationDetails(context?.client.notificationDetails ?? null);
  }, [context]);

  useEffect(() => {
    async function fetchOgImage() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await refetchSettings();
      const url =
        res?.data[6]?.urlString ??
        `${process.env.NEXT_PUBLIC_DEFAULT_REDIRECT}`;

      try {
        const res = await fetch(`/api/og?url=${url}`);
        const data = await res.json();
        console.log(data);
        if (data.error) {
          setOgImage(
            `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
          );
          setOgUrl(url);
        } else {
          if (data.image !== "") {
            setOgImage(data.image);
            setOgUrl(data.url);
          } else {
            setOgImage(
              `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
            );
            setOgUrl(url);
          }
        }
      } catch (err) {
        setOgImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
        setOgUrl(url);
      }
    }
    fetchOgImage();
  }, [auctions.length]);

  // Wait for component to mount to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <nav className="max-w-6xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">$QR</h1>
        <div className="flex items-center gap-3">
          {/* <a
            href={`${process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <span className="underline underline-offset-2">Buy $QR</span>
          </a> */}
          <ConnectButton
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto">
        {/* {!isLoading && (
          <AuctionNavigation
            currentId={currentAuctionId}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onLatest={handleLatest}
            date={formatDate(currentAuction?.startTime || BigInt(DEFAULT_DATE))}
            isLatest={currentAuctionId === LATEST_AUCTION_ID.current}
          />
        )} */}
        {isLoading && <Skeleton className="h-[40px] w-full mb-4" />}
        <div className="flex flex-col justify-center items-center gap-10">
          <div className="grid md:grid-cols-2 gap-4 md:gap-8 w-full">
            {!isLoading && (
              <div className="flex flex-col justify-center p-8 h-[280px] md:h-[368px] bg-white rounded-lg">
                <div className="inline-flex flex-col items-center mt-6">
                  <QRPage />
                  <div className="mt-1">
                    <SafeExternalLink
                      href={`${process.env.NEXT_PUBLIC_HOST_URL}/redirect`}
                      className="relative inline-flex items-center bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors w-full"
                      onBeforeNavigate={() => false}
                    >
                      <span className="block w-full text-center">
                        Visit Website{" "}
                      </span>
                      <ExternalLink className="absolute left-full h-3 w-3  ml-1" />
                    </SafeExternalLink>
                  </div>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="flex items-start justify-start border-gray-600 rounded-lg">
                <Skeleton className="h-[250px] w-full md:w-3xl rounded-xl" />
              </div>
            )}
            {!isLoading && currentAuctionId !== 0 && (
              <AuctionDetails
                id={currentAuctionId}
                onPrevious={handlePrevious}
                onNext={handleNext}
                isLatest={currentAuctionId === LATEST_AUCTION_ID.current}
              />
            )}
            {isLoading && <Skeleton className="flex-1" />}
          </div>
          {currentAuctionId === LATEST_AUCTION_ID.current && ogImage && (
            <div className="flex flex-col justify-center items-center gap-1">
              <label className="font-semibold text-xl md:text-2xl inline-flex gap-2">
                🏆<span className="underline">Today&apos;s Winner</span>🏆
              </label>
              <div className="flex flex-col rounded-md justify-center items-center h-full md:h-[200px] w-full md:w-[376px] mt-1  overflow-hidden bg-white aspect-[2/1]">
                {ogImage && currentAuctionId !== 8 && (
                  <img
                    src={ogImage}
                    alt="Open Graph"
                    className="object-cover w-full h-full"
                    onClick={() => {
                      window.location.href = ogUrl;
                    }}
                  />
                )}
                {ogImage && currentAuctionId === 8 && (
                  <img
                    src={"https://i.imgur.com/fzojQUs.png"}
                    alt="Open Graph"
                    className="object-cover w-full h-full"
                    onClick={() => {
                      window.location.href = ogUrl;
                    }}
                  />
                )}
              </div>
              <div className="inline-flex gap-1 italic">
                <span className="font-normal text-gray-600">
                  The QR coin currently points to
                </span>
                <span className="font-medium underline">
                  <a
                    href={ogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:opacity-80 transition-opacity"
                    aria-label="redirect"
                  >
                    {formatURL(ogUrl)}
                  </a>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-10 py-4 text-center flex flex-col items-center">
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
          className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label className="mr-1 cursor-pointer">CA: {contractAddress}</label>
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
        
        {(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" && process.env.NODE_ENV === "development") || process.env.VERCEL_ENV === "preview" && (
          <a 
            href="/debug" 
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Debug Panel
          </a>
        )}
      </footer>

      <SafetyDialog
        isOpen={isOpen}
        onClose={closeDialog}
        targetUrl={pendingUrl || ""}
        onContinue={handleContinue}
      />
    </main>
  );
}
