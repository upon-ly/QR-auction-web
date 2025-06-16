'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CustomWallet } from '@/components/CustomWallet';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { ThemeDialog } from '@/components/ThemeDialog';
import { QRContextMenu } from '@/components/QRContextMenu';
import { useBaseColors } from '@/hooks/useBaseColors';
import { useFetchAuctions, getLatestV3AuctionId } from '@/hooks/useFetchAuctions';
import { frameSdk } from '@/lib/frame-sdk';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const isBaseColors = useBaseColors();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [latestV3Id, setLatestV3Id] = useState(0);
  const [isInFrame, setIsInFrame] = useState(false);
  
  // Check if we're on the Base Colors UI page
  const isBaseColorsUI = pathname === '/ui';
  
  // Call useFetchAuctions without a tokenId parameter to get auctions from all contracts
  const { auctions } = useFetchAuctions();
  
  // Check if we're in a frame context
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        await frameSdk.getContext();
        setIsInFrame(true);
      } catch {
        setIsInFrame(false);
      }
    };
    
    checkFrameContext();
  }, []);
  
  // Fetch the latest V3 auction ID when auctions data updates
  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const v3Id = getLatestV3AuctionId(auctions);
      setLatestV3Id(v3Id);
    }
  }, [auctions]);

  const handleLogoClick = () => {
    // Use the stored latestV3Id state
    if (latestV3Id > 0) {
      // Navigate to the latest V3 auction
      router.push(`/auction/${latestV3Id}`);
    } else {
      // Fallback to the root path if no V3 auctions found
      router.push('/'); 
    }
  };

  // Handle map link click
  const handleMapClick = async (e: React.MouseEvent) => {
    if (isInFrame) {
      e.preventDefault();
      try {
        await frameSdk.redirectToUrl("https://farcaster.xyz/miniapps/TrUF1v7ul3hA/qr-map");
      } catch (error) {
        console.error("Failed to open URL in frame:", error);
        // Fallback to regular link
        window.open("https://farcaster.xyz/miniapps/TrUF1v7ul3hA/qr-map", "_blank");
      }
    }
  };

  return (
    <nav className="w-full md:max-w-3xl mx-auto flex justify-between items-center mt-18 md:mt-20 md:mb-8 lg:mt-20 lg:mb-8 px-4 md:px-0">
      {isBaseColorsUI ? (
        <div className="flex items-center">
          <QRContextMenu className="inline-block" isHeaderLogo>
            <h1
              onClick={handleLogoClick}
              className="text-xl md:text-2xl font-bold cursor-pointer"
            >
              $QR
            </h1>
          </QRContextMenu>
          <a href="https://www.basecolors.com" target="_blank" rel="noopener noreferrer" className="ml-2 flex items-center">
            <img
              src="https://www.basecolors.com/favicon.png"
              alt="Basecolors Logo"
              className="h-6 w-auto"
            />
            <span className="ml-2 text-xl md:text-2xl font-bold">Base Colors</span>
          </a>
        </div>
      ) : (
        <QRContextMenu className="inline-block" isHeaderLogo>
          <h1
            onClick={handleLogoClick}
            className="text-2xl font-bold cursor-pointer"
          >
            $QR
          </h1>
        </QRContextMenu>
      )}
      
      <div className="flex items-center gap-1 md:gap-3">
        <Link href="/about">
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-8 w-8 md:h-10 md:w-10"
                : "h-8 w-8 md:h-10 md:w-10"
            }
          >
            <div className="h-5 w-5 md:h-10 md:w-10 flex items-center justify-center">
              <span className="md:hidden text-lg">?</span>
              <span className="hidden md:inline text-lg mx-0.5">?</span>
            </div>
          </Button>
        </Link>
        
        <Link href="/winners">
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-8 w-8 md:h-10 md:w-10"
                : "h-8 w-8 md:h-10 md:w-10"
            }
          >
            <div className="h-5 w-5 flex items-center justify-center md:h-10 md:w-10">
              🏆
            </div>
          </Button>
        </Link>

        {isInFrame ? (
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-8 w-8 md:h-10 md:w-10"
                : "h-8 w-8 md:h-10 md:w-10"
            }
            onClick={handleMapClick}
          >
            <div className="h-5 w-5 flex items-center justify-center md:h-10 md:w-10">
              🌎
            </div>
          </Button>
        ) : (
          <Link href="https://farcaster.xyz/miniapps/TrUF1v7ul3hA/qr-map" target="_blank">
            <Button
              variant="outline"
              size="icon"
              className={
                isBaseColors
                  ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-8 w-8 md:h-10 md:w-10"
                  : "h-8 w-8 md:h-10 md:w-10"
              }
            >
              <div className="h-5 w-5 flex items-center justify-center md:h-10 md:w-10">
                🌎
              </div>
            </Button>
          </Link>
        )}

        <Button
          variant="outline"
          size="icon"
          className={
            isBaseColors
              ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-8 w-8 md:h-10 md:w-10"
              : "h-8 w-8 md:h-10 md:w-10"
          }
          onClick={() => setThemeDialogOpen(true)}
        >
          <div className="h-5 w-5 flex items-center justify-center">
            {isBaseColors ? (
              <img 
                src="/basecolors2.jpeg" 
                alt="Theme toggle - base colors"
                className="h-5 w-5 object-cover"
              />
            ) : (
              <img 
                src="/basecolors.jpeg" 
                alt="Theme toggle - light/dark" 
                className="h-5 w-5 object-cover border"
              />
            )}
          </div>
        </Button>
        
        <div className="relative">
          <CustomWallet />
          <div className="absolute right-0 top-full mt-2 pr-1 z-50"> {/* Added z-index */} 
            <ConnectionIndicator />
          </div>
        </div>
      </div>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </nav>
  );
} 