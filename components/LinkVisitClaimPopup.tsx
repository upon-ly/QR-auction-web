import { useState, useEffect, useRef, useCallback } from 'react';
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
import { usePrivy, useLogin, useConnectWallet } from "@privy-io/react-auth";
import { Turnstile } from '@marsidev/react-turnstile';

interface LinkVisitClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  hasClicked: boolean;
  winningUrl: string;
  winningImage: string;
  auctionId: number;
  onClaim: (captchaToken: string) => Promise<{ txHash?: string }>;
  isPrivyModalActive: boolean;
  isTwitterUserNeedsWallet: boolean;
}

// Custom dialog overlay with standard z-index
function CustomDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  );
}

// Custom dialog content with standard z-index
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
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
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
  onClaim,
  isPrivyModalActive,
  isTwitterUserNeedsWallet
}: LinkVisitClaimPopupProps) {
  // Web context detection
  const [isWebContext, setIsWebContext] = useState(false);
  const [persistentToastId, setPersistentToastId] = useState<string | number | null>(null);
  const { authenticated } = usePrivy();
  const { connectWallet } = useConnectWallet();
  
  // NEW: Track click state in localStorage
  const CLICK_STATE_KEY = 'qrcoin_link_clicked';
  
  const setClickedInStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CLICK_STATE_KEY, 'true');
    }
  }, []);
  
  const getClickedFromStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(CLICK_STATE_KEY) === 'true';
    }
    return false;
  }, []);
  
  const clearClickedFromStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CLICK_STATE_KEY);
    }
  }, []);

  // Check both hook state and localStorage for click status
  const hasClickedAny = hasClicked || getClickedFromStorage();
  
  
  const { login } = useLogin({
    onComplete: () => {
      setIsConnecting(false);
      if (persistentToastId) {
        toast.dismiss(persistentToastId);
        setPersistentToastId(null);
      }
      
      // The LinkVisitProvider will handle wallet connection for Twitter users
      // Don't call connectWallet() here to avoid double wallet modals
    },
    onError: () => {
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
      } catch {
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
  const [isAutoConnectingWallet, setIsAutoConnectingWallet] = useState(false);
  
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
          // Web flow: visit -> (trigger wallet connection) -> claim -> success (skip captcha for authenticated users)
          if (!authenticated) {
            return 'visit'; // Will trigger wallet connection after visiting
          } else if (hasClickedAny) {
            if (hasClaimed) {
              return 'already_claimed';
            } else {
              // Clear the click state when entering claim state
              clearClickedFromStorage();
              return 'claim'; // Go directly to claim state for authenticated users
            }
          } else {
            return 'visit';
          }
        } else {
          // Mini-app flow: visit -> claim -> success (skip captcha)
          if (hasClickedAny) {
            // Clear the click state when entering claim state
            clearClickedFromStorage();
            return 'claim';
          } else {
            return 'visit';
          }
        }
      });
    }
  }, [isOpen, hasClicked, hasClickedAny, isWebContext, authenticated, claimState, hasClaimed, clearClickedFromStorage]);

  // Handle automatic state transition when authentication changes
  useEffect(() => {
    if (isWebContext && authenticated && !isEligibilityLoading) {
      // If user is authenticated and we're in connecting state, move to claim (skip captcha)
      if (claimState === 'connecting' && !isConnecting) {
        
        // Check if user has already claimed - if so, show already_claimed state
        if (hasClaimed) {
          setClaimState('already_claimed');
        } else {
          // Clear the click state when transitioning to claim state
          clearClickedFromStorage();
          setClaimState('claim');
        }
      }
      // If user is authenticated and has clicked (either from hook or localStorage), and we're still in visit state
      else if (claimState === 'visit' && hasClickedAny) {
        if (hasClaimed) {
          setClaimState('already_claimed');
        } else {
          // Clear the click state when transitioning to claim state
          clearClickedFromStorage();
          setClaimState('claim');
        }
      }
    }
  }, [authenticated, hasClickedAny, hasClaimed, claimState, isWebContext, isConnecting, isEligibilityLoading, clearClickedFromStorage]);

  // Handle mini-app auto-transition when hasClickedAny changes
  useEffect(() => {
    if (!isWebContext && hasClickedAny && claimState === 'visit') {
      if (hasClaimed) {
        setClaimState('already_claimed');
      } else {
        // Clear the click state when transitioning to claim state
        clearClickedFromStorage();
        setClaimState('claim');
      }
    }
  }, [hasClickedAny, isWebContext, claimState, hasClaimed, clearClickedFromStorage]);

  // NEW: Handle real-time claim status changes when popup is already open
  useEffect(() => {
    // If popup is open and we're in claim state, but user has now claimed, show already_claimed
    if (isOpen && claimState === 'claim' && hasClaimed) {
      setClaimState('already_claimed');
    }
  }, [isOpen, claimState, hasClaimed]);

  // NEW: Auto-connect wallet for Twitter users who need it when entering claim state
  useEffect(() => {
    if (isOpen && claimState === 'claim' && isTwitterUserNeedsWallet && authenticated && !isAutoConnectingWallet) {
      // Automatically trigger wallet connection for Twitter users
      setIsAutoConnectingWallet(true);
      connectWallet({
        onSuccess: () => {
          setIsAutoConnectingWallet(false);
          // Keep the popup open - wallet is now connected
          // The component will re-render with isTwitterUserNeedsWallet = false
          toast.success('Wallet connected! You can now claim your $QR');
          
          // Clear the flow state since wallet is now connected
          if (typeof window !== 'undefined') {
            localStorage.removeItem('qrcoin_claim_flow_state');
          }
        },
        onError: () => {
          setIsAutoConnectingWallet(false);
          toast.error('Please connect a wallet to claim your $QR');
          // Go back to visit state if wallet connection fails
          setClaimState('visit');
        }
      });
    }
  }, [isOpen, claimState, isTwitterUserNeedsWallet, authenticated, isAutoConnectingWallet, connectWallet]);

  // Check if we're running in a Farcaster frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrameRef.current = !!context?.user;
      } catch {
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
    
    // NEW: Prevent claiming if Twitter user needs wallet
    if (isTwitterUserNeedsWallet) {
      toast.error('Please connect a wallet first to claim your $QR');
      return;
    }
    
    // NEW: Skip captcha for authenticated users (Twitter provides verification)
    // Only require captcha for non-authenticated web users
    if (isWebContext && !authenticated && !captchaToken) {
      toast.error('Please complete the verification first.');
      return;
    }
    
    isClaimingRef.current = true;
    
    try {
      setClaimState('success');
      
      // Clear the click state since they've successfully claimed
      clearClickedFromStorage();
      
      toast.success('420 $QR has been sent to your wallet.', {
        style: {
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: '1px solid var(--border)'
        },
        duration: 5000,
      });
      
      // Pass captcha token to claim function (empty string for authenticated users)
      onClaim(captchaToken || '').catch(() => {
      });
    } finally {
      setTimeout(() => {
        isClaimingRef.current = false;
      }, 2000);
    }
  };

  // Handle link click
  const onLinkClick = async () => {
    
    // Mark as clicked in localStorage immediately
    setClickedInStorage();
    
    try {
      if (isWebContext) {
        // Web context: use redirect route for consistent tracking
        const trackedUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(CLICK_SOURCES.POPUP_IMAGE)}`;
        
        window.open(trackedUrl, '_blank', 'noopener,noreferrer');
        
        // Move to next state based on authentication status
        if (!authenticated) {
          // NEW: Set flow state when starting Twitter auth flow
          if (typeof window !== 'undefined') {
            localStorage.setItem('qrcoin_claim_flow_state', 'claiming');
          }
          // Trigger wallet connection
          handleConnectWallet();
        } else if (isEligibilityLoading) {
          // Wait for eligibility check to complete
          // Clear the click state when transitioning to claim state
          clearClickedFromStorage();
          setClaimState('claim'); // Go directly to claim state for authenticated users
        } else {
          // Already authenticated and eligibility check complete, check if they've already claimed
          if (hasClaimed) {
            setClaimState('already_claimed');
          } else {
            // Clear the click state when transitioning to claim state
            clearClickedFromStorage();
            setClaimState('claim'); // Go directly to claim state for authenticated users
          }
        }
      } else {
        // Mini-app context: use frameSdk (existing logic)
        const trackedUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/redirect?source=${encodeURIComponent(CLICK_SOURCES.POPUP_IMAGE)}`;
        
        try {
          await frameSdk.redirectToUrl(trackedUrl);
          setTimeout(() => {
            if (hasClaimed) {
              setClaimState('already_claimed');
            } else {
              // Clear the click state when transitioning to claim state
              clearClickedFromStorage();
              setClaimState('claim');
            }
          }, 1000);
        } catch {
          window.open(trackedUrl, '_blank', 'noopener,noreferrer');
          setTimeout(() => {
            if (hasClaimed) {
              setClaimState('already_claimed');
            } else {
              setClaimState('claim');
            }
          }, 1000);
        }
      }
    } catch {
      toast.error('Failed to open link. Please try again.');
    }
  };

  // Handle connect wallet (web only)
  const handleConnectWallet = () => {
    
    // Set connecting state to show appropriate UI
    setIsConnecting(true);
    setClaimState('connecting');
    
    // Show persistent toast with updated message
    const toastId = toast.info('Sign in with X (Twitter) to claim 420 $QR', {
      duration: Infinity, // Persistent until manually dismissed
    });
    setPersistentToastId(toastId);
    
    // Trigger Privy login modal
    login();
  };

  // Handle captcha verification
  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token);
    setShowCaptcha(false);
    // Clear the click state when transitioning to claim state
    clearClickedFromStorage();
    // Auto-advance to claim state
    setClaimState('claim');
  };

  const handleCaptchaError = () => {
    setCaptchaToken(null);
    setShowCaptcha(false);
    toast.error('Captcha verification failed. Please try again.');
  };

  const handleCaptchaExpire = () => {
    setCaptchaToken(null);
    setShowCaptcha(false);
    // Reset to captcha state to try again
    setClaimState('captcha');
  };

  // Show captcha when entering claim state (only for non-authenticated web users)
  useEffect(() => {
    if (claimState === 'claim' && isWebContext && !authenticated && !showCaptcha && !captchaToken) {
      setShowCaptcha(true);
    }
  }, [claimState, isWebContext, authenticated, showCaptcha, captchaToken]);

  // Handle share
  const handleShare = async () => {
    if (isWebContext) {
      // Web context: Twitter/X share with quote tweet
      const shareText = encodeURIComponent(`just got paid 420 $QR to check out today's winner @qrcoindotfun`);
      
      // TODO: Replace this with the actual tweet URL you want to quote
      const tweetToQuote = "";
      
      const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(tweetToQuote)}`;
      
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Mini-app context: Warpcast share (existing logic)
      const shareText = encodeURIComponent(`just got paid 420 $QR to check out today's winner @qrcoindotfun`);
      const embedUrl = encodeURIComponent(`https://qrcoin.fun/86`);
      
      let shareUrl = `https://warpcast.com/~/compose?text=${shareText}&embeds[]=${embedUrl}`;
      
      const quoteCastUrl = "https://farcaster.xyz/qrcoindotfun/0x5b0a987a";
      if (quoteCastUrl) {
        shareUrl += `&embeds[]=${encodeURIComponent(quoteCastUrl)}`;
      }
      
      if (isFrameRef.current) {
        try {
          await frameSdk.redirectToUrl(shareUrl);
        } catch {
        }
      } else {
        window.open(shareUrl, '_blank', "noopener,noreferrer");
      }
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Only prevent closing during active wallet connection process
      if (!open && claimState === 'connecting' && isConnecting) {
        return;
      }
      
      // Only prevent closing if Privy modal is actively showing (not just flagged)
      if (!open && isPrivyModalActive && isConnecting) {
        return;
      }
      
      // NEW: Prevent closing if Twitter user is connecting wallet in claim state
      if (!open && claimState === 'claim' && isTwitterUserNeedsWallet && isAutoConnectingWallet) {
        return;
      }
      
      // Allow normal closing for all other cases
      if (!open) {
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
                Click to claim 420 $QR!
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
                  Connect your wallet or enter your email to claim 420 $QR
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
                  Claim 420 $QR
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
                  {isTwitterUserNeedsWallet && isAutoConnectingWallet ? 
                    'Connecting your wallet...' :
                    isTwitterUserNeedsWallet ? 
                    'Connect a wallet to claim your $QR' :
                    'Thanks for checking out today\'s winner!'}
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
                    disabled={isClaimLoading || isTwitterUserNeedsWallet}
                  >
                    {isClaimLoading ? 'Processing...' : 
                     (isTwitterUserNeedsWallet && isAutoConnectingWallet) ? 'Connecting Wallet...' : 
                     isTwitterUserNeedsWallet ? 'Connect Wallet' :
                     'Claim'}
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
                  420 $QR sent to your wallet.
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
                  className="w-full flex justify-center mt-2"
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
