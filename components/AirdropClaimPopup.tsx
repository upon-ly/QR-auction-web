import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPortal } from './ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';
import { cn } from "@/lib/utils";
import confetti from 'canvas-confetti';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { toast } from "sonner";
import { hapticActions } from "@/lib/haptics";

interface AirdropClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onClaim: () => Promise<{ txHash?: string }>;
  isEligible: boolean;
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
          "sm:max-w-md bg-card border-border",
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

export function AirdropClaimPopup({ isOpen, onClose, onClaim, isEligible }: AirdropClaimPopupProps) {
  const [claimState, setClaimState] = useState<'idle' | 'success' | 'error'>('idle');
  const isFrameRef = useRef(false);
  
  // Check if we're running in a Farcaster frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        isFrameRef.current = await frameSdk.isInMiniApp() || (await frameSdk.getContext()).client.clientFid == 309857;
        console.log("Frame context check:", isFrameRef.current ? "In mini app" : "Not in mini app");
      } catch (error) {
        console.error("Error checking mini app context:", error);
        isFrameRef.current = false;
      }
    }
    checkFrameContext();
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setClaimState('idle');
    }
  }, [isOpen]);
  
  // Add cleanup effect when dialog closes
  useEffect(() => {
    if (!isOpen) {
      // Force cleanup when dialog closes
      confetti.reset();
      
      // Force focus back to the document body to avoid focus issues
      setTimeout(() => {
        document.body.focus();
      }, 0);
    }
    
    return () => {
      // Additional cleanup when component unmounts
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

      // Create multiple confetti bursts
      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }
        
        // Random colors
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

  const handleClaim = async () => {
    // Trigger haptic feedback for claim button
    await hapticActions.claimStarted();
    
    // Immediately show success state
    setClaimState('success');
    
    // Trigger success haptic
    await hapticActions.claimSuccess();
    
    // Show success toast with black styling
    toast.success('1,000 $QR has been sent to your wallet.', {
      style: {
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        border: '1px solid var(--border)'
      },
      duration: 5000,
    });
    
    // Process claim in background without affecting UI
    try {
      // Call the API in the background
      onClaim().catch(err => {
        console.error('Background claim error:', err);
        // We don't show any error to the user as we've already shown success
      });
    } catch (error) {
      // Silent catch - we don't want to affect the UI
      console.error('Claim error (silenced):', error);
    }
  };
  
  // Handle share to Warpcast
  const handleShare = async () => {
    // Trigger haptic feedback for share button
    await hapticActions.shareInitiated();
    
    // Create Warpcast URL with the share text and embed the website URL
    const shareText = encodeURIComponent("free money $QR. just add the mini app to claim:");
    const embedUrl = encodeURIComponent("https://farcaster.xyz/jake/0x2330db73");
    const shareUrl = `https://warpcast.com/~/compose?text=${shareText}&embeds[]=${embedUrl}&embeds[]=${encodeURIComponent("https://qrcoin.fun")}`;
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(shareUrl);
      } catch (error) {
        console.error("Error opening Warpcast in frame:", error);
      }
    } else {
      window.open(shareUrl, '_blank', "noopener,noreferrer");
    }
    
    // Also close the dialog after sharing
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={true}>
      <CustomDialogContent>
        <div className="flex flex-col items-center justify-center p-6 text-center space-y-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className={`w-32 h-32 rounded-full flex items-center justify-center mb-2 ${claimState === 'success' ? 'bg-green-500/20' : 'bg-secondary'}`}
          >
            {claimState === 'success' ? (
              <Check className="h-20 w-20 text-green-500" />
            ) : (
              <img 
                src="/qrLogoWebsite.png" 
                alt="QR Token" 
                className="w-28 h-28"
              />
            )}
          </motion.div>

          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-bold text-foreground"
          >
            {!isEligible 
              ? 'You have already claimed' 
              : claimState === 'success' 
                ? 'Claim Successful!' 
                : 'Claim 1,000 $QR'}
          </motion.h2>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground"
          >
            {!isEligible 
              ? 'Thank you for your support!' 
              : claimState === 'success' 
                ? '1,000 $QR sent to your wallet.' 
                : 'Thank you for adding our mini app!'}
          </motion.p>

          {isEligible && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full flex justify-center space-x-4"
            >
              {claimState === 'success' ? (
                <Button 
                  variant="default" 
                  className="bg-[#472B92] hover:bg-[#3b2277] text-white px-6 py-2 rounded-md flex items-center focus:outline-none focus:ring-0"
                  onClick={handleShare}
                >
                  Share
                </Button>
              ) : (
                <Button 
                  variant="default" 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md focus:outline-none focus:ring-0"
                  onClick={handleClaim}
                >
                  Claim
                </Button>
              )}
            </motion.div>
          )}

          {!isEligible && (
            <Button 
              variant="default" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md"
              onClick={onClose}
            >
              Continue
            </Button>
          )}
        </div>
      </CustomDialogContent>
    </Dialog>
  );
} 