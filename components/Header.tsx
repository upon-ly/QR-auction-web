'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CustomWallet } from '@/components/CustomWallet';
import { ThemeDialog } from '@/components/ThemeDialog';
import { QRContextMenu } from '@/components/QRContextMenu';
import { useBaseColors } from '@/hooks/useBaseColors';
import { useFetchAuctions, getLatestV3AuctionId } from '@/hooks/useFetchAuctions';
import { useIsMiniApp } from '@/hooks/useIsMiniApp';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { hapticActions } from '@/lib/haptics';

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const isBaseColors = useBaseColors();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [latestV3Id, setLatestV3Id] = useState(0);
  const { isMiniApp } = useIsMiniApp();
  
  // Check if we're on the Base Colors UI page
  const isBaseColorsUI = pathname === '/ui';
  
  // Call useFetchAuctions without a tokenId parameter to get auctions from all contracts
  const { auctions } = useFetchAuctions();
  
  // Fetch the latest V3 auction ID when auctions data updates
  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const v3Id = getLatestV3AuctionId(auctions);
      setLatestV3Id(v3Id);
    }
  }, [auctions]);

  const handleLogoClick = async () => {
    // Trigger haptic feedback for navigation
    await hapticActions.navigate();
    
    // Use the stored latestV3Id state
    if (latestV3Id > 0) {
      // Navigate to the latest V3 auction
      router.push(`/auction/${latestV3Id}`);
    } else {
      // Fallback to the root path if no V3 auctions found
      router.push('/'); 
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
        
        <Link href="/winners">
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10 md:h-10 md:w-10"
                : "h-10 w-10 md:h-10 md:w-10"
            }
          >
            <div className="text-xl flex items-center justify-center">
              🏆
            </div>
          </Button>
        </Link>

        <Link 
            href="https://shop.qrcoin.fun" 
            target="_blank"
            onClick={async (e) => {
              // Use cached mini app status
              if (isMiniApp) {
                e.preventDefault();
                await frameSdk.redirectToUrl("https://shop.qrcoin.fun");
              }
              // Otherwise, not in mini app, let Link handle normally
            }}
          >
            <Button
              variant="outline"
              size="icon"
              className={
                isBaseColors
                  ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10 md:h-10 md:w-10"
                  : "h-10 w-10 md:h-10 md:w-10"
              }
            >
              <div className="text-xl flex items-center justify-center">
                🔥
              </div>
            </Button>
          </Link>

        
          <Link 
            href="https://map.qrcoin.fun" 
            target="_blank"
            onClick={async (e) => {
              // Use cached mini app status
              if (isMiniApp) {
                e.preventDefault();
                await frameSdk.redirectToUrl("https://farcaster.xyz/miniapps/vTuDnU8a1PCz/qr-map");
              }
              // Otherwise, not in mini app, let Link handle normally
            }}
          >
            <Button
              variant="outline"
              size="icon"
              className={
                isBaseColors
                  ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10 md:h-10 md:w-10"
                  : "h-10 w-10 md:h-10 md:w-10"
              }
            >
              <div className="text-xl flex items-center justify-center">
                🌎
              </div>
            </Button>
          </Link>

          <Link href="/about">
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10 md:h-10 md:w-10"
                : "h-10 w-10 md:h-10 md:w-10"
            }
          >
            <div className="text-xl flex items-center justify-center">
              ℹ️
            </div>
          </Button>
        </Link>

        <Button
          variant="outline"
          size="icon"
          className={
            isBaseColors
              ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10 md:h-10 md:w-10"
              : "h-10 w-10 md:h-10 md:w-10"
          }
          onClick={async () => {
            await hapticActions.buttonPress();
            setThemeDialogOpen(true);
          }}
        >
          <div className="h-6 w-6 md:h-5 md:w-5 flex items-center justify-center">
            {isBaseColors ? (
              <img 
                src="/basecolors2.jpeg" 
                alt="Theme toggle - base colors"
                className="h-6 w-6 md:h-5 md:w-5 object-cover"
              />
            ) : (
              <img 
                src="/basecolors.jpeg" 
                alt="Theme toggle - light/dark" 
                className="h-6 w-6 md:h-5 md:w-5 object-cover border"
              />
            )}
          </div>
        </Button>
        
        <div className="relative">
          <CustomWallet />
        </div>
      </div>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </nav>
  );
} 