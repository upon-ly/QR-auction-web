import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPortal } from './ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';
import { cn } from "@/lib/utils";
import confetti from 'canvas-confetti';
import { frameSdk } from '@/lib/frame-sdk';
import { toast } from "sonner";
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { useAuctionImage } from '@/hooks/useAuctionImage';
import { CLICK_SOURCES } from '@/lib/click-tracking';

interface LinkVisitClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  hasClicked: boolean;
  winningUrl: string;
  winningImage: string;
  auctionId: number;
  onClaim: () => Promise<{ txHash?: string }>;
}

// Custom dialog overlay with lower z-index (40 instead of 50)
function CustomDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/80",
        className
      )}
      {...props}
    />
  );
}

// Custom dialog content with lower z-index (40 instead of 50)
function CustomDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <CustomDialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-40 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          "sm:max-w-sm bg-card border-border max-h-[85vh] overflow-y-auto",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function LinkVisitClaimPopup({ 
  isOpen, 
  onClose, 
  hasClicked,
  winningUrl,
  winningImage,
  auctionId,
  onClaim
}: LinkVisitClaimPopupProps) {
  // Use the claim hook for link click handling
  const { isClaimLoading } = useLinkVisitClaim(auctionId);
  
  // Use the auction image hook to check if it's a video with URL fallback
  const { data: auctionImageData } = useAuctionImage(auctionId, winningUrl);
  
  // Three states: visit (initial), claim (after visiting), success (after claiming)
  const [claimState, setClaimState] = useState<'visit' | 'claim' | 'success'>('visit');
  const isFrameRef = useRef(false);
  const isClaimingRef = useRef(false); // Additional ref to prevent double claims
  
  // Check if the winning image is a video - use auction data if available, otherwise assume false
  const isVideo = auctionImageData?.isVideo || false;
  
  // Reset state when dialog opens based on hasClicked
  useEffect(() => {
    if (isOpen) {
      console.log('LinkVisitClaimPopup opened:', { hasClicked });
      // Set initial state based on whether user has already clicked the link
      // Only reset state if we're not already in 'success' state
      setClaimState(prevState => {
        // Don't change state if we're already in success state
        if (prevState === 'success') return prevState;
        // Otherwise set based on hasClicked
        return hasClicked ? 'claim' : 'visit';
      });
    }
  }, [isOpen, hasClicked]);

  // Check if we're running in a Farcaster frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrameRef.current = !!context?.user;
        console.log("Frame context check in ClaimPopup:", isFrameRef.current ? "In frame" : "Not in frame");
      } catch (error) {
        console.error("Error checking frame context:", error);
      }
    }
    checkFrameContext();
  }, []);

  // Reset confetti when dialog closes
  useEffect(() => {
    if (!isOpen) {
      confetti.reset();
      
      // Force focus back to the document body to avoid focus issues
      setTimeout(() => {
        document.body.focus();
      }, 0);
    }
    
    return () => {
      confetti.reset();
    };
  }, [isOpen]);

  // Fire confetti when claim succeeds
  useEffect(() => {
    if (claimState === 'success') {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      
      const randomInRange = (min: number, max: number) => {
        return Math.random() * (max - min) + min;
      };

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }
        
        confetti({
          particleCount: Math.floor(randomInRange(20, 40)),
          spread: randomInRange(50, 100),
          origin: { y: 0.6, x: randomInRange(0.3, 0.7) },
          colors: ['#FFD700', '#FFA500', '#00FF00', '#0000FF', '#FF00FF'],
          disableForReducedMotion: true,
        });
      }, 250);
      
      return () => {
        clearInterval(interval);
        confetti.reset();
      };
    }
  }, [claimState]);

  // Simply visit the link, update UI state to show claim button
  const onLinkClick = async () => {
    console.log('Link clicked, handling click for URL:', winningUrl);
    
    try {
      // Create tracked redirect URL for popup image clicks
      const trackedUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(CLICK_SOURCES.POPUP_IMAGE)}`;
      
      // Open the tracked redirect URL with frameSdk
      if (trackedUrl) {
        try {
          console.log('Redirecting to tracked URL:', trackedUrl);
          await frameSdk.redirectToUrl(trackedUrl);
          
          // After visiting, show claim button
          console.log('Link visited, showing claim button');
          setTimeout(() => {
            setClaimState('claim');
          }, 1000); // Small delay to make transition feel natural
          
        } catch (error) {
          console.error('Error using frameSdk for redirect, falling back to window.open:', error);
          window.open(trackedUrl, '_blank', 'noopener,noreferrer');
          
          // Still update state after fallback
          setTimeout(() => {
            setClaimState('claim');
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error handling link click:', error);
      toast.error('Failed to open link. Please try again.');
    }
  };

  // Handle claim - this is where we'll record the transaction
  const handleClaimAction = async () => {
    if (isClaimLoading || isClaimingRef.current) return; // Prevent double-clicks during loading
    
    isClaimingRef.current = true; // Set claiming flag immediately
    
    try {
      // Immediately show success state for better UX
      setClaimState('success');
      
      // Show success toast
      toast.success('1,000 $QR has been sent to your wallet.', {
        style: {
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: '1px solid var(--border)'
        },
        duration: 5000,
      });
      
      // Process claim in background - this creates the database entry
      try {
        onClaim().catch(err => {
          console.error('Background claim error:', err);
          // We don't show this error since we already showed success UI
        });
      } catch (error) {
        console.error('Claim error (silenced):', error);
      }
    } finally {
      // Reset claiming flag after a delay to prevent immediate re-claims
      setTimeout(() => {
        isClaimingRef.current = false;
      }, 2000);
    }
  };
  
  // Handle share to Warpcast
  const handleShare = async () => {
    const shareText = encodeURIComponent(`I just got paid 1,000 $QR for checking out today's winner @qrcoindotfun!`);
    const embedUrl = encodeURIComponent(``);
    
    // Add the main auction URL embed
    let shareUrl = `https://warpcast.com/~/compose?text=${shareText}&embeds[]=${embedUrl}`;
    
    // Add a quote cast as an additional embed (hardcoded example for now)
    // Can replace this with an actual quote cast URL when needed
    const quoteCastUrl = "https://farcaster.xyz/qrcoindotfun/0xac819ffe"; // Empty for now, add a real URL when needed
    if (quoteCastUrl) {
      shareUrl += `&embeds[]=${encodeURIComponent(quoteCastUrl)}`;
    }
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(shareUrl);
        // close the popup
        onClose();
      } catch (error) {
        console.error("Error opening Warpcast in frame:", error);
      }
    } else {
      window.open(shareUrl, '_blank', "noopener,noreferrer");
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={true}>
      <CustomDialogContent className="p-0 overflow-hidden">
        <div className="flex flex-col items-center justify-center text-center">
          {claimState === 'success' ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-28 h-28 rounded-full flex items-center justify-center bg-green-500/20 mt-6"
            >
              <Check className="h-16 w-16 text-green-500" />
            </motion.div>
          ) : claimState === 'claim' ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
            >
              <img 
                src="/qrLogo.png" 
                alt="QR Token" 
                className="w-28 h-28"
              />
            </motion.div>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-full rounded-t-lg overflow-hidden bg-secondary"
              >
                <button
                  onClick={onLinkClick}
                  className="w-full bg-white aspect-[2/1] overflow-hidden cursor-pointer focus:outline-none"
                  aria-label="Visit today's winning link"
                >
                  {isVideo ? (
                    <video
                      src={winningImage}
                      poster="https://i.postimg.cc/85DwR5m5/74winner.jpg"
                      loop
                      autoPlay
                      playsInline
                      className="object-cover w-full h-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <img 
                      src={winningImage || `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`}
                      alt="Today's winning link" 
                      className="object-cover w-full h-full"
                    />
                  )}
                </button>
              </motion.div>
            </>
          )}

          <div className="p-6 pt-4 space-y-4 w-full">
            {claimState === 'visit' && (
              <motion.h2 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground"
              >
                Click to claim 1,000 $QR!
              </motion.h2>
            )}
            
            {claimState === 'claim' && (
              <motion.h2 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground"
              >
                Claim 1,000 $QR
              </motion.h2>
            )}
            
            {claimState === 'success' && (
              <motion.h2 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground"
              >
                Claim Successful!
              </motion.h2>
            )}

            {claimState === 'visit' && (
              <>
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2"
                >
                  <Button 
                    variant="default" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md flex items-center focus:outline-none focus:ring-0 h-9"
                    onClick={onLinkClick}
                  >
                    Today&apos;s Winner
                  </Button>
                </motion.div>
              </>
            )}

            {claimState === 'claim' && (
              <>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground mb-5"
                >
                  Thanks for checking out today&apos;s winner!
                </motion.p>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2"
                >
                  <Button 
                    variant="default" 
                    className="light:bg-black dark:bg-white text-primary-foreground dark:text-black px-6 py-2 rounded-md focus:outline-none focus:ring-0 h-9"
                    onClick={handleClaimAction}
                    disabled={isClaimLoading}
                  >
                    {isClaimLoading ? 'Processing...' : 'Claim'}
                  </Button>
                </motion.div>
              </>
            )}

            {claimState === 'success' && (
              <>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground mb-5"
                >
                  1,000 $QR sent to your wallet.
                </motion.p>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2"
                >
                  <Button 
                    variant="default" 
                    className="bg-[#472B92] hover:bg-[#3b2277] text-white px-6 py-2 rounded-md flex items-center focus:outline-none focus:ring-0 h-9"
                    onClick={handleShare}
                  >
                    Share
                  </Button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </CustomDialogContent>
    </Dialog>
  );
} 