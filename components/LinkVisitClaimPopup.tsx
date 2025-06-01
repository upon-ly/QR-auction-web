import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPortal } from './ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { Check, X as XIcon, Wallet } from 'lucide-react';
import { cn } from "@/lib/utils";
import confetti from 'canvas-confetti';
import { frameSdk } from '@/lib/frame-sdk';
import { toast } from "sonner";
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useAuctionImage } from '@/hooks/useAuctionImage';
import { CLICK_SOURCES } from '@/lib/click-tracking';
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { Turnstile } from '@marsidev/react-turnstile';

interface LinkVisitClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  hasClicked: boolean;
  winningUrl: string;
  winningImage: string;
  auctionId: number;
  onClaim: (captchaToken: string) => Promise<{ txHash?: string }>;
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
  // Web context detection
  const [isWebContext, setIsWebContext] = useState(false);
  const [persistentToastId, setPersistentToastId] = useState<string | number | null>(null);
  const { authenticated } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      console.log("Login completed, dismissing persistent toast");
      setIsConnecting(false);
      if (persistentToastId) {
        toast.dismiss(persistentToastId);
        setPersistentToastId(null);
      }
      // Don't automatically transition here - let the useEffect handle it
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      setIsConnecting(false);
      if (persistentToastId) {
        toast.dismiss(persistentToastId);
        setPersistentToastId(null);
      }
      // Reset to visit state on error
      setClaimState('visit');
    }
  });
  
  // Detect context on mount
  useEffect(() => {
    async function detectContext() {
      try {
        const context = await frameSdk.getContext();
        setIsWebContext(!context?.user?.fid);
      } catch (error) {
        console.error("Error detecting context:", error);
        setIsWebContext(true);
      }
    }
    detectContext();
  }, []);

  // Three states for both web and mini-app: visit, connecting, captcha, claim, success, already_claimed
  // Web flow: visit -> captcha -> claim -> success
  // Mini-app flow: visit -> claim -> success  
  const [claimState, setClaimState] = useState<'visit' | 'connecting' | 'captcha' | 'claim' | 'success' | 'already_claimed'>('visit');
  const isFrameRef = useRef(false);
  const isClaimingRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasClickedLocally, setHasClickedLocally] = useState(false); // Track click in this session
  
  // Captcha state
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  
  // Use the claim hook and eligibility hook
  const { isClaimLoading } = useLinkVisitClaim(auctionId, isWebContext);
  const { hasClaimed, isLoading: isEligibilityLoading } = useLinkVisitEligibility(auctionId, isWebContext);
  
  // Use the auction image hook to check if it's a video with URL fallback
  const { data: auctionImageData } = useAuctionImage(auctionId, winningUrl);
  
  // Check if the winning image is a video - use auction data if available, otherwise assume false
  const isVideo = auctionImageData?.isVideo || false;
  
  // Reset state when dialog opens based on hasClicked and context
  useEffect(() => {
    if (isOpen) {
      console.log('LinkVisitClaimPopup opened:', { hasClicked, hasClickedLocally, isWebContext, authenticated, claimState });
      
      setClaimState(prevState => {
        // Don't reset if we're already in success state
        if (prevState === 'success') return prevState;
        
        // Don't reset if we're already in already_claimed state
        if (prevState === 'already_claimed') return prevState;
        
        // Don't reset if we're in connecting state (during authentication flow)
        if (prevState === 'connecting') return prevState;
        
        // Don't reset if we're in captcha or claim state and user is authenticated
        if ((prevState === 'captcha' || prevState === 'claim') && authenticated) return prevState;
        
        if (isWebContext) {
          // Web flow: visit -> (trigger wallet connection) -> captcha -> claim -> success
          if (!authenticated) {
            return 'visit'; // Will trigger wallet connection after visiting
          } else if (hasClicked || hasClickedLocally) {
            if (hasClaimed) {
              return 'already_claimed';
            } else {
              return 'captcha'; // Go to captcha state for web users
            }
          } else {
            return 'visit';
          }
        } else {
          // Mini-app flow: visit -> claim -> success (skip captcha)
          return (hasClicked || hasClickedLocally) ? 'claim' : 'visit';
        }
      });
    }
  }, [isOpen, hasClicked, hasClickedLocally, isWebContext, authenticated, claimState]);

  // Handle automatic state transition when authentication changes
  useEffect(() => {
    if (isWebContext && authenticated && !isEligibilityLoading) {
      // If user is authenticated and we're in connecting state, move to captcha
      if (claimState === 'connecting' && !isConnecting) {
        console.log('Authentication completed, checking if user has already claimed...');
        
        // Check if user has already claimed - if so, show already_claimed state
        if (hasClaimed) {
          console.log('User has already claimed, showing already_claimed state');
          setClaimState('already_claimed');
        } else {
          console.log('User has not claimed, transitioning to captcha state');
          setClaimState('captcha');
        }
      }
      // If user is authenticated and has clicked (either from hook or locally), and we're still in visit state
      else if (claimState === 'visit' && (hasClicked || hasClickedLocally)) {
        if (hasClaimed) {
          console.log('User authenticated, has clicked, but already claimed - showing already_claimed state');
          setClaimState('already_claimed');
        } else {
          console.log('User authenticated and has clicked, transitioning to captcha state');
          setClaimState('captcha');
        }
      }
    }
  }, [authenticated, hasClicked, hasClickedLocally, hasClaimed, claimState, isWebContext, isConnecting, isEligibilityLoading]);

  // Handle mini-app auto-transition when hasClickedLocally changes
  useEffect(() => {
    if (!isWebContext && hasClickedLocally && claimState === 'visit') {
      console.log('Mini-app user clicked locally, auto-transitioning to claim state');
      if (hasClaimed) {
        console.log('Mini-app user has already claimed, showing already_claimed state');
        setClaimState('already_claimed');
      } else {
        console.log('Mini-app user has not claimed, going to claim state');
        setClaimState('claim');
      }
    }
  }, [hasClickedLocally, isWebContext, claimState, hasClaimed]);

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

  // Handle claim action
  const handleClaimAction = async () => {
    if (isClaimLoading || isClaimingRef.current) return;
    
    // Check if captcha is required and verified (web users only)
    if (isWebContext && !captchaToken) {
      toast.error('Please complete the verification first.');
      return;
    }
    
    isClaimingRef.current = true;
    
    try {
      setClaimState('success');
      
      toast.success('1,000 $QR has been sent to your wallet.', {
        style: {
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: '1px solid var(--border)'
        },
        duration: 5000,
      });
      
      // Pass captcha token to claim function (null for mini-app users)
      onClaim(captchaToken || '').catch(err => {
        console.error('Background claim error:', err);
      });
    } finally {
      setTimeout(() => {
        isClaimingRef.current = false;
      }, 2000);
    }
  };

  // Handle link click
  const onLinkClick = async () => {
    console.log('Link clicked, handling click for URL:', winningUrl);
    
    // Mark as clicked locally immediately
    setHasClickedLocally(true);
    
    try {
      if (isWebContext) {
        // Web context: use redirect route for consistent tracking
        const trackedUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(CLICK_SOURCES.POPUP_IMAGE)}`;
        
        console.log('Opening tracked URL in new tab (web context):', trackedUrl);
        window.open(trackedUrl, '_blank', 'noopener,noreferrer');
        
        // Move to next state based on authentication status
        if (!authenticated) {
          // Trigger wallet connection
          handleConnectWallet();
        } else if (isEligibilityLoading) {
          // Wait for eligibility check to complete
          console.log('Waiting for eligibility check to complete...');
          setClaimState('captcha'); // Go to captcha state for web users
        } else {
          // Already authenticated and eligibility check complete, check if they've already claimed
          if (hasClaimed) {
            console.log('User is authenticated and has already claimed, showing already_claimed state');
            setClaimState('already_claimed');
          } else {
            console.log('User is authenticated and has not claimed, going to captcha state');
            setClaimState('captcha'); // Go to captcha state for web users
          }
        }
      } else {
        // Mini-app context: use frameSdk (existing logic)
        const trackedUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(CLICK_SOURCES.POPUP_IMAGE)}`;
        
        try {
          await frameSdk.redirectToUrl(trackedUrl);
          setTimeout(() => {
            if (hasClaimed) {
              console.log('Mini-app user has already claimed, showing already_claimed state');
              setClaimState('already_claimed');
            } else {
              setClaimState('claim');
            }
          }, 1000);
        } catch (error) {
          console.error("Error redirecting to URL:", error);
          window.open(trackedUrl, '_blank', 'noopener,noreferrer');
          setTimeout(() => {
            if (hasClaimed) {
              console.log('Mini-app user has already claimed (fallback), showing already_claimed state');
              setClaimState('already_claimed');
            } else {
              setClaimState('claim');
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error handling link click:', error);
      toast.error('Failed to open link. Please try again.');
    }
  };

  // Handle connect wallet (web only)
  const handleConnectWallet = () => {
    console.log('Triggering Privy login modal');
    
    // Set connecting state to show appropriate UI
    setIsConnecting(true);
    setClaimState('connecting');
    
    // Show persistent toast
    const toastId = toast.info('Connect wallet or enter email to claim 1000 $QR', {
      duration: Infinity, // Persistent until manually dismissed
    });
    setPersistentToastId(toastId);
    
    // Trigger Privy login modal
    login();
  };

  // Handle captcha verification
  const handleCaptchaSuccess = (token: string) => {
    console.log('Captcha verified successfully, advancing to claim state');
    setCaptchaToken(token);
    setShowCaptcha(false);
    // Auto-advance to claim state
    setClaimState('claim');
  };

  const handleCaptchaError = () => {
    console.error('Captcha verification failed');
    setCaptchaToken(null);
    setShowCaptcha(false);
    toast.error('Captcha verification failed. Please try again.');
  };

  const handleCaptchaExpire = () => {
    console.log('Captcha expired');
    setCaptchaToken(null);
    setShowCaptcha(false);
    // Reset to captcha state to try again
    setClaimState('captcha');
  };

  // Show captcha when entering claim state (web users only)
  useEffect(() => {
    if (claimState === 'claim' && isWebContext && !showCaptcha && !captchaToken) {
      setShowCaptcha(true);
    }
  }, [claimState, isWebContext, showCaptcha, captchaToken]);

  // Handle share
  const handleShare = async () => {
    if (isWebContext) {
      // Web context: Twitter/X share with quote tweet
      const shareText = encodeURIComponent(`just got paid 1,000 $QR to check out today's winner @qrcoindotfun`);
      
      // TODO: Replace this with the actual tweet URL you want to quote
      const tweetToQuote = "https://qrcoin.fun";
      
      const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(tweetToQuote)}`;
      
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Mini-app context: Warpcast share (existing logic)
      const shareText = encodeURIComponent(`just got paid 1,000 $QR to check out today's winner @qrcoindotfun

check if any of your wallets have unclaimed airdrops via today’s winner @dropsdotbot.eth`);
      const embedUrl = encodeURIComponent(`https://qrcoin.fun/86`);
      
      let shareUrl = `https://warpcast.com/~/compose?text=${shareText}&embeds[]=${embedUrl}`;
      
      const quoteCastUrl = "https://farcaster.xyz/qrcoindotfun/0x99af7d4c";
      if (quoteCastUrl) {
        shareUrl += `&embeds[]=${encodeURIComponent(quoteCastUrl)}`;
      }
      
      if (isFrameRef.current) {
        try {
          await frameSdk.redirectToUrl(shareUrl);
        } catch (error) {
          console.error("Error opening Warpcast in frame:", error);
        }
      } else {
        window.open(shareUrl, '_blank', "noopener,noreferrer");
      }
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen && claimState !== 'connecting'} onOpenChange={(open) => {
      // Allow normal closing when not in connecting state
      if (!open && claimState !== 'connecting') {
        onClose();
      }
    }} modal={true}>
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
          ) : claimState === 'already_claimed' ? (
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
          ) : claimState === 'connecting' ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
            >
              <Wallet className="h-16 w-16 text-primary" />
            </motion.div>
          ) : claimState === 'captcha' ? (
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
            
            {claimState === 'connecting' && (
              <>
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Connect Your Wallet
                </motion.h2>
                
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground mb-5"
                >
                  Connect your wallet or enter your email to claim 1,000 $QR
                </motion.p>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span className="text-sm">Connecting...</span>
                  </div>
                </motion.div>
              </>
            )}
            
            {claimState === 'claim' && (
              <>
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Claim 1,000 $QR
                </motion.h2>
              </>
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
            
            {claimState === 'already_claimed' && (
              <motion.h2 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground"
              >
                Already Claimed
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
                  className="w-full flex justify-center mt-2 min-h-[65px]"
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
                    className={`${
                      isWebContext 
                        ? "bg-[#1DA1F2] hover:bg-[#0d8bd9]" 
                        : "bg-[#472B92] hover:bg-[#3b2277]"
                    } text-white px-6 py-2 rounded-md flex items-center focus:outline-none focus:ring-0 h-9`}
                    onClick={handleShare}
                  >
                    Share
                  </Button>
                </motion.div>
              </>
            )}
            
            {claimState === 'already_claimed' && (
              <>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground mb-5"
                >
                  Come back tomorrow for more $QR!
                </motion.p>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2"
                >
                  <Button 
                    variant="default" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md focus:outline-none focus:ring-0 h-9"
                    onClick={onClose}
                  >
                    OK
                  </Button>
                </motion.div>
              </>
            )}

            {claimState === 'captcha' && (
              <>
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Security Check
                </motion.h2>
                
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground mb-5"
                >
                  Please verify you&apos;re human to continue
                </motion.p>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center mt-2 min-h-[65px]"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Turnstile
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAAiGgT-bNZFUpUYw'}
                      onSuccess={handleCaptchaSuccess}
                      onError={handleCaptchaError}
                      onExpire={handleCaptchaExpire}
                      options={{
                        theme: 'auto',
                        size: 'normal',
                      }}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </CustomDialogContent>
    </Dialog>
  );
} 