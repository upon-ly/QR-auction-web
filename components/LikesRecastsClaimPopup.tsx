import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPortal } from './ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';
import { cn } from "@/lib/utils";
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { toast } from "sonner";
import { useClaimLikesRecasts } from '@/hooks/useClaimLikesRecasts';
import { useLikesRecastsEligibility } from '@/hooks/useLikesRecastsEligibility';

interface LikesRecastsClaimPopupProps {
  isOpen: boolean;
  onClose: () => void;
  hasAlreadyClaimed: boolean;
  testMode?: boolean; // New prop for test mode
}

// Test mode configuration
const TEST_MODE_CONFIG = {
  AUTO_PROGRESS_DELAY: 2000, // 2 seconds between state changes
  MOCK_QR_URL: 'https://warpcast.com/~/add-cast-action?url=https%3A%2F%2Fexample.com%2Ftest-signer',
  MOCK_SIGNER_UUID: 'test-signer-uuid-12345',
};

// Hardcoded test mode flag - change this to enable/disable test mode
const ENABLE_TEST_MODE = false;

// Check if test mode should be enabled
function getTestModeEnabled(): boolean {
  if (typeof window === 'undefined') return ENABLE_TEST_MODE;
  
  // Always respect the hardcoded flag first
  if (ENABLE_TEST_MODE) return true;
  
  // In development mode, also check localStorage for persistent testing
  if (process.env.NODE_ENV === 'development') {
    return localStorage.getItem('likes-popup-test-mode') === 'true';
  }
  
  return false;
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
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-40 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg p-6 shadow-lg duration-200 sm:max-w-lg",
          "sm:max-w-sm bg-card max-h-[85vh] overflow-y-auto",
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

// Farcaster Icons
const HeartIcon = ({ className }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
    <path d="M9 16.0312L9.38813 16.7805C9.26819 16.8426 9.13508 16.8751 9 16.8751C8.86492 16.8751 8.73182 16.8426 8.61188 16.7805L8.60287 16.776L8.58263 16.7648C8.46482 16.7039 8.34853 16.6401 8.23387 16.5735C6.86271 15.7931 5.56911 14.8838 4.37063 13.8577C2.30062 12.0724 0 9.39375 0 6.1875C0 3.1905 2.34675 1.125 4.78125 1.125C6.52163 1.125 8.04712 2.02725 9 3.3975C9.95288 2.02725 11.4784 1.125 13.2188 1.125C15.6532 1.125 18 3.1905 18 6.1875C18 9.39375 15.6994 12.0724 13.6294 13.8577C12.3293 14.9693 10.9178 15.9434 9.41738 16.7648L9.39712 16.776L9.39038 16.7794H9.38813L9 16.0312ZM4.78125 2.8125C3.27825 2.8125 1.6875 4.122 1.6875 6.1875C1.6875 8.60625 3.465 10.8495 5.47312 12.5798C6.56874 13.5169 7.74949 14.3496 9 15.0671C10.2505 14.3496 11.4313 13.5169 12.5269 12.5798C14.535 10.8495 16.3125 8.60625 16.3125 6.1875C16.3125 4.122 14.7218 2.8125 13.2188 2.8125C11.6741 2.8125 10.2836 3.92175 9.81112 5.5755C9.76137 5.75232 9.6552 5.90804 9.50877 6.01895C9.36235 6.12986 9.18369 6.18989 9 6.18989C8.81631 6.18989 8.63765 6.12986 8.49123 6.01895C8.3448 5.90804 8.23863 5.75232 8.18888 5.5755C7.71637 3.92175 6.32587 2.8125 4.78125 2.8125Z" fill="currentColor" />
  </svg>
);

const RecastIcon = ({ className }: { className?: string }) => (
  <svg width="19" height="18" viewBox="0 0 19 18" fill="none" className={className}>
    <path d="M2.41813 9.00562C2.5282 8.99243 2.63979 9.00106 2.74652 9.03101C2.85326 9.06096 2.95305 9.11166 3.04018 9.18019C3.12732 9.24873 3.20009 9.33377 3.25434 9.43044C3.3086 9.52712 3.34327 9.63354 3.35638 9.74362C3.49975 10.9294 3.98324 12.0483 4.7485 12.9653C5.51375 13.8823 6.52806 14.5583 7.669 14.9115C8.80994 15.2648 10.0287 15.2803 11.1783 14.9562C12.3279 14.632 13.359 13.9821 14.1474 13.0849L12.7929 11.7304C12.7534 11.691 12.7266 11.6409 12.7157 11.5863C12.7048 11.5316 12.7104 11.475 12.7317 11.4235C12.753 11.3721 12.7891 11.3281 12.8355 11.2972C12.8818 11.2663 12.9363 11.2499 12.992 11.25H17.0938C17.1683 11.25 17.2399 11.2796 17.2926 11.3324C17.3454 11.3851 17.375 11.4567 17.375 11.5312V15.633C17.3751 15.6887 17.3587 15.7432 17.3278 15.7895C17.2969 15.8359 17.2529 15.872 17.2014 15.8933C17.15 15.9146 17.0934 15.9202 17.0387 15.9093C16.9841 15.8984 16.934 15.8716 16.8946 15.8321L15.3421 14.2796C14.3288 15.3996 13.0148 16.2046 11.5568 16.5988C10.0988 16.993 8.55817 16.9597 7.11854 16.5029C5.67891 16.0461 4.40095 15.1851 3.43693 14.0224C2.47291 12.8597 1.86348 11.4443 1.68125 9.945C1.66806 9.83493 1.67668 9.72333 1.70664 9.6166C1.73659 9.50986 1.78729 9.41008 1.85582 9.32294C1.92436 9.23581 2.0094 9.16303 2.10607 9.10878C2.20275 9.05452 2.30917 9.01985 2.41925 9.00675L2.41813 9.00562ZM9.5 2.8125C8.62026 2.81157 7.75049 2.99869 6.94897 3.36132C6.14745 3.72396 5.4327 4.25372 4.85263 4.91512L6.20713 6.26962C6.24656 6.30896 6.27343 6.35912 6.28432 6.41374C6.29522 6.46836 6.28965 6.52499 6.26832 6.57644C6.24699 6.6279 6.21086 6.67186 6.16452 6.70276C6.11817 6.73366 6.0637 6.7501 6.008 6.75H1.90625C1.83166 6.75 1.76012 6.72037 1.70738 6.66762C1.65463 6.61488 1.625 6.54334 1.625 6.46875V2.367C1.6249 2.3113 1.64134 2.25682 1.67224 2.21048C1.70314 2.16414 1.7471 2.12801 1.79855 2.10668C1.85001 2.08535 1.90663 2.07978 1.96126 2.09068C2.01588 2.10157 2.06604 2.12844 2.10538 2.16787L3.65788 3.72037C4.67122 2.6004 5.98518 1.79536 7.4432 1.40118C8.90122 1.00699 10.4418 1.04029 11.8815 1.49708C13.3211 1.95388 14.5991 2.81493 15.5631 3.97763C16.5271 5.14033 17.1365 6.55566 17.3187 8.055C17.3453 8.27728 17.2825 8.50101 17.1441 8.67697C17.0057 8.85292 16.803 8.96669 16.5807 8.99325C16.3585 9.0198 16.1347 8.95697 15.9588 8.81856C15.7828 8.68016 15.6691 8.47753 15.6425 8.25525C15.4605 6.75419 14.7352 5.37173 13.6035 4.36895C12.4718 3.36617 11.0121 2.8125 9.5 2.8125Z" fill="currentColor" />
  </svg>
);

// QR Code component using an external service
function QRCodeDisplay({ value, testMode = false }: { value: string; testMode?: boolean }) {
  // Check if user is on mobile (Warpcast)
  const isMobile = typeof window !== 'undefined' && (
    navigator.userAgent === "warpcast" || 
    /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  
  if (isMobile) {
    // Show deep link button on mobile - no QR code
    return (
      <div className="flex flex-col items-center space-y-4">
        <Button 
          onClick={() => testMode ? console.log('Test mode: would open', value) : frameSdk.redirectToUrl(value)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md flex items-center gap-2"
        >
          {testMode ? 'Test Approval' : 'Proceed'}
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Tap to review & approve on Farcaster
        </p>
      </div>
    );
  }
  
  // Show QR code on desktop - centered
  const qrUrl = testMode 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('TEST_MODE_QR_CODE')}`
    : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(value)}`;
    
  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="bg-white p-4 rounded-lg flex justify-center">
        <img 
          src={qrUrl}
          alt={testMode ? "Test QR Code" : "QR Code for signer approval"}
          className="w-48 h-48"
        />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Scan QR to review & approve on Farcaster
      </p>
      {testMode && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          🧪 Test Mode Active
        </p>
      )}
    </div>
  );
}

export function LikesRecastsClaimPopup({ 
  isOpen, 
  onClose, 
  hasAlreadyClaimed,
  testMode: propTestMode = false
}: LikesRecastsClaimPopupProps) {
  // Change from follows to just likes and recasts
  const [likesEnabled, setLikesEnabled] = useState(true); // Default to true
  const [recastsEnabled, setRecastsEnabled] = useState(true); // Default to true
  const [claimState, setClaimState] = useState<'select' | 'claiming' | 'signer_approval' | 'signer_approved' | 'success' | 'error'>('select');
  const [claimAmount, setClaimAmount] = useState(0);
  const isFrameRef = useRef(false);
  const testModeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Determine if test mode is enabled
  const testMode = propTestMode || getTestModeEnabled();
  
  // Helper function to check if any permission is selected
  const hasAnyPermission = likesEnabled || recastsEnabled;
  
  // Helper function to get selected permissions array
  const getSelectedPermissions = () => {
    const permissions = [];
    if (likesEnabled) permissions.push('like');
    if (recastsEnabled) permissions.push('recast');
    return permissions;
  };
  
  // Helper function to determine option type for API compatibility
  const getOptionType = () => {
    const permissions = getSelectedPermissions();
    if (permissions.length === 1 && permissions.includes('like')) return 'likes';
    if (permissions.length === 1 && permissions.includes('recast')) return 'recasts';
    if (permissions.length === 2 && permissions.includes('like') && permissions.includes('recast')) return 'both';
    return 'likes'; // fallback
  };
  
  // Use the hooks only if not in test mode
  const hookResults = useClaimLikesRecasts();
  const eligibilityResults = useLikesRecastsEligibility();
  
  // Check database for actual claim status
  const [actualClaimStatus, setActualClaimStatus] = useState<{
    hasClaimedAny: boolean;
    hasClaimedLikes: boolean;
    hasClaimedRecasts: boolean;
    hasClaimedBoth: boolean;
    isLoading: boolean;
  }>({
    hasClaimedAny: false,
    hasClaimedLikes: false,
    hasClaimedRecasts: false,
    hasClaimedBoth: false,
    isLoading: true
  });
  
  // Mock data for test mode
  const mockData = {
    claimTokens: async () => ({ signer_approval_url: TEST_MODE_CONFIG.MOCK_QR_URL }),
    isPolling: false,
    signerApprovalUrl: TEST_MODE_CONFIG.MOCK_QR_URL,
    signerUuid: TEST_MODE_CONFIG.MOCK_SIGNER_UUID,
    pendingClaim: { amount: claimAmount },
    clearApprovalState: () => {},
    executeClaimAirdrop: async () => {},
    isSignerApproved: async () => true,
  };
  
  const mockEligibility = {
    walletAddress: '0x1234567890123456789012345678901234567890',
    hasSignerApproval: false,
  };
  
  // Use real hooks or mock data based on test mode
  const {
    claimTokens,
    isPolling,
    signerApprovalUrl,
    signerUuid,
    pendingClaim,
    clearApprovalState,
    executeClaimAirdrop,
    isSignerApproved,
  } = testMode ? mockData : hookResults;

  // Get wallet address from eligibility hook
  const { walletAddress, hasSignerApproval } = testMode ? mockEligibility : eligibilityResults;

  // Test mode auto-progression logic
  useEffect(() => {
    if (!testMode || !isOpen) return;
    
    const progressStates = () => {
      // Auto-progress from claiming to signer approval (otherwise gets stuck)
      if (claimState === 'claiming') {
        testModeTimeoutRef.current = setTimeout(() => {
          setClaimState('signer_approval');
        }, TEST_MODE_CONFIG.AUTO_PROGRESS_DELAY);
      }
      // Auto-progress through the QR code approval step
      else if (claimState === 'signer_approval') {
        // Auto-progress to signer approved (simulate approval)
        testModeTimeoutRef.current = setTimeout(() => {
          setClaimState('signer_approved');
        }, TEST_MODE_CONFIG.AUTO_PROGRESS_DELAY * 2); // Longer delay for approval
      }
    };
    
    progressStates();
    
    return () => {
      if (testModeTimeoutRef.current) {
        clearTimeout(testModeTimeoutRef.current);
      }
    };
  }, [testMode, isOpen, claimState]);

  // Show test mode indicator
  useEffect(() => {
    if (testMode && isOpen) {
      toast.info('🧪 Test Mode: Processing and QR approval auto-complete, other steps require manual interaction', {
        duration: 4000,
      });
    }
  }, [testMode, isOpen]);

  // Check if we're in a frame (skip in test mode)
  useEffect(() => {
    if (testMode) return;
    
    async function checkFrameContext() {
      try {
        isFrameRef.current = await frameSdk.isInMiniApp();
      } catch {
        console.log('Not in mini app context');
        isFrameRef.current = false;
      }
    }
    
    checkFrameContext();
  }, [testMode]);

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen) {
      if (testMode) {
        // Reset to select state for test mode
        setClaimState('select');
        setLikesEnabled(true);
        setRecastsEnabled(true);
        setClaimAmount(0);
      } else if (hasSignerApproval) {
        // If user has approved signer, go directly to claim screen
        setClaimState('signer_approved');
        setLikesEnabled(true);
        setRecastsEnabled(true);
        setClaimAmount(0);
      } else {
        setClaimState('select');
        setLikesEnabled(true);
        setRecastsEnabled(true);
        setClaimAmount(0);
      }
    }
  }, [isOpen, hasSignerApproval, testMode]);

  // Check for existing approved signer when popup opens and auto-claim (skip in test mode)
  useEffect(() => {
    if (testMode) return;
    
    if (isOpen && hasSignerApproval && claimState === 'signer_approved' && !pendingClaim) {
      // Background API call to set up pendingClaim state and fetch user's actual permissions
      const autoSetupClaim = async () => {
        try {
          // Get frame context for user info
          const context = await frameSdk.getContext();
          if (!context?.user?.fid || !walletAddress) {
            console.error('User context or wallet address not found');
            return;
          }
          
          // Call our API to get user permissions and set up claim
          const response = await fetch(`/api/likes-recasts/user-permissions?fid=${context.user.fid}`);
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.permissions) {
              const hasLikePermission = data.permissions.includes('like');
              const hasRecastPermission = data.permissions.includes('recast');
              
              let userOptionType: string;
              let userAmount: number;
              
              if (hasLikePermission && hasRecastPermission) {
                userOptionType = 'both';
                userAmount = 2000;
              } else if (hasLikePermission) {
                userOptionType = 'likes';
                userAmount = 1000;
              } else if (hasRecastPermission) {
                userOptionType = 'recasts';
                userAmount = 1000;
              } else {
                // Fallback case
                userOptionType = 'both';
                userAmount = 2000;
              }
              
              console.log(`User has permissions for: ${userOptionType}, amount: ${userAmount}`);
              
              // Set the correct option and amount based on their actual permissions
              if (userOptionType === 'likes') {
                setLikesEnabled(true);
                setRecastsEnabled(false);
                setClaimAmount(1000);
              } else if (userOptionType === 'recasts') {
                setLikesEnabled(false);
                setRecastsEnabled(true);
                setClaimAmount(1000);
              } else if (userOptionType === 'both') {
                setLikesEnabled(true);
                setRecastsEnabled(true);
                setClaimAmount(2000);
              }
              
              // Call API to set up pendingClaim state with their actual option
              await claimTokens(
                context.user.fid,
                walletAddress,
                context.user.username || null,
                userOptionType
              );
            }
          } else {
            console.error('Failed to fetch user permissions');
            // Fallback to 'both' if we can't fetch permissions
            setLikesEnabled(true);
            setRecastsEnabled(true);
            setClaimAmount(2000);
            await claimTokens(
              context.user.fid,
              walletAddress,
              context.user.username || null,
              'both'
            );
          }
          
        } catch (error) {
          console.error('Background claim setup error:', error);
          // Stay on claim screen even if background setup fails
        }
      };
      
      autoSetupClaim();
    }
  }, [isOpen, hasSignerApproval, claimState, walletAddress, claimTokens, pendingClaim, testMode]);

  // Handle signer approval state changes (skip in test mode)
  useEffect(() => {
    if (testMode) return;
    
    if (signerApprovalUrl && signerUuid) {
      console.log('Got signer approval URL, transitioning to signer_approval state');
      setClaimState('signer_approval');
    }
  }, [signerApprovalUrl, signerUuid, testMode]);

  // Check if signer is approved and update UI (skip in test mode)
  useEffect(() => {
    if (testMode) return;
    
    // Check approval status whenever we have a signerUuid and are in signer_approval state
    if (signerUuid && claimState === 'signer_approval') {
      const checkApproval = async () => {
        try {
          const approved = await isSignerApproved(signerUuid);
          if (approved) {
            console.log('Signer approved! Transitioning to signer_approved state');
            setClaimState('signer_approved');
          }
        } catch (error) {
          console.error('Error checking signer approval:', error);
        }
      };
      
      // Check immediately
      checkApproval();
      
      // Also set up an interval to check periodically (backup to polling)
      const intervalId = setInterval(checkApproval, 2000); // Check every 2 seconds
      
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [signerUuid, claimState, isSignerApproved, testMode]);

  // Additional effect to handle when polling stops (original logic as backup)
  useEffect(() => {
    if (testMode) return;
    
    if (signerUuid && claimState === 'signer_approval' && !isPolling) {
      console.log('Polling stopped, doing final approval check');
      const checkApproval = async () => {
        try {
          const approved = await isSignerApproved(signerUuid);
          if (approved) {
            console.log('Final check: Signer approved! Transitioning to signer_approved state');
            setClaimState('signer_approved');
          }
        } catch (error) {
          console.error('Error in final approval check:', error);
        }
      };
      
      checkApproval();
    }
  }, [signerUuid, claimState, isPolling, isSignerApproved, testMode]);

  // Confetti effect for success state
  useEffect(() => {
    if (claimState === 'success') {
      interface ConfettiGlobal {
        confetti?: {
          (options: {
            particleCount: number;
            spread: number;
            origin: { y: number };
            colors: string[];
          }): void;
          reset(): void;
        };
      }
      
      const global = globalThis as ConfettiGlobal;
      const confetti = global.confetti;
      
      if (confetti) {
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
        
        const fire = () => {
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.6 },
            colors: colors
          });
        };
        
        fire();
        const interval = setInterval(fire, 200);
        
        setTimeout(() => {
          clearInterval(interval);
        }, 2000);
        
        return () => {
          clearInterval(interval);
          confetti.reset();
        };
      }
    }
  }, [claimState]);

  // Helper function to get reward amount
  const getRewardAmount = () => {
    if (likesEnabled && recastsEnabled) return 2000; // Both selected
    if (likesEnabled && !recastsEnabled) return 1000; // Only likes
    if (!likesEnabled && recastsEnabled) return 1000; // Only recasts
    return 0; // None selected
  };

  // Update claim amount when permissions change
  useEffect(() => {
    setClaimAmount(getRewardAmount());
  }, [likesEnabled, recastsEnabled]);

  // Check actual claim status from database when popup opens
  useEffect(() => {
    if (!isOpen || testMode) return;
    
    const checkClaimStatus = async () => {
      try {
        const context = await frameSdk.getContext();
        if (!context?.user?.fid) return;
        
        const response = await fetch(`/api/likes-recasts/claim-status?fid=${context.user.fid}`);
        const data = await response.json();
        
        if (data.success) {
          const claims = data.all_claims || [];
          const statusUpdate = {
            hasClaimedAny: claims.length > 0,
            hasClaimedLikes: claims.some((c: { option_type: string }) => c.option_type === 'likes'),
            hasClaimedRecasts: claims.some((c: { option_type: string }) => c.option_type === 'recasts'),
            hasClaimedBoth: claims.some((c: { option_type: string }) => c.option_type === 'both'),
            isLoading: false
          };
          
          console.log('Claim status check result:', { 
            fid: context.user.fid,
            claims,
            statusUpdate,
            hasSignerApproval 
          });
          
          setActualClaimStatus(statusUpdate);
        } else {
          setActualClaimStatus(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error checking claim status:', error);
        setActualClaimStatus(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    checkClaimStatus();
  }, [isOpen, testMode]);

  const handleClaim = async () => {
    if (!hasAnyPermission) return;
    
    setClaimState('claiming');
    
    const optionType = getOptionType();
    // Use dynamic reward calculation
    const amount = getRewardAmount();
    setClaimAmount(amount);
    
    // In test mode, just set up the state and let auto-progression handle the rest
    if (testMode) {
      toast.info('🧪 Test Mode: Simulating claim process');
      return;
    }
    
    try {
      // Get frame context for user info
      const context = await frameSdk.getContext();
      if (!context?.user?.fid) {
        throw new Error('User context not found');
      }

      // Get wallet address from your wallet context - you'll need to implement this
      if (!walletAddress) {
        throw new Error('Wallet address not found');
      }
      
      const result = await claimTokens(
        context.user.fid,
        walletAddress,
        context.user.username || null,
        optionType
      );
      
      // Handle different response cases
      if ('ready_to_claim' in result && result.ready_to_claim) {
        // Existing signer already approved - go directly to approved state
        setClaimState('signer_approved');
      } else if (!result.signer_approval_url) {
        // Direct success (shouldn't happen with new API but handle gracefully)
        setClaimState('success');
        toast.success(`${amount.toLocaleString()} $QR has been sent to your wallet.`, {
          style: {
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            border: '1px solid var(--border)'
          },
          duration: 5000,
        });
      }
      // If signer approval needed, the useEffect will handle the state change
      
    } catch (error) {
      console.error('Claim error:', error);
      setClaimState('error');
      toast.error('Failed to claim. Please try again.');
    }
  };

  // Handle manual claim after signer approval
  const handleManualClaim = async () => {
    // Calculate the correct amount based on user's actual permissions or current selection
    let correctAmount = 0;
    
    if (pendingClaim?.amount) {
      // Use amount from pending claim if available
      correctAmount = pendingClaim.amount;
    } else {
      // Calculate based on current toggle state (for users with existing signer approval)
      correctAmount = getRewardAmount();
      
      // If still 0, try to determine from user's actual permissions
      if (correctAmount === 0) {
        // Default based on common case - both permissions
        correctAmount = 2000;
      }
    }
    
    // Update claimAmount state for UI consistency
    setClaimAmount(correctAmount);
    
    // Immediately show success state for better UX (like other popups)
    setClaimState('success');
    
    // Show success toast immediately with correct amount
    toast.success(`${correctAmount.toLocaleString()} $QR has been sent to your wallet.`, {
      style: {
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        border: '1px solid var(--border)'
      },
      duration: 5000,
    });

    if (testMode) {
      toast.info('🧪 Test Mode: Simulated claim completion');
      return;
    }

    // Process claim in background without affecting UI (like other popups)
    try {
      executeClaimAirdrop().catch(err => {
        console.error('Background claim error:', err);
        // We don't show this error since we already showed success UI
      });
    } catch (error) {
      console.error('Claim error (silenced):', error);
    }
  };
  
  // Handle share to Warpcast
  const handleShare = async () => {
    // const getShareText = () => {
    //   const permissions = getSelectedPermissions();
    //   if (permissions.length === 1) {
    //     return permissions[0] === 'like' ? 'likes' : 'recasts';
    //   } else if (permissions.length === 2) {
    //     return 'likes/recasts';
    //   }
    //   return 'engagement';
    // };
    
    const shareText = encodeURIComponent(`i just got paid ${claimAmount.toLocaleString()} $QR for pledging my support to @qrcoindotfun!`);
    const embedUrl = "" // Update with actual cast URL
    const quoteUrl = "https://farcaster.xyz/qrcoindotfun/0xdf1ab09a";
    const shareUrl = `https://farcaster.xyz/~/compose?text=${shareText}&embeds[]=${embedUrl}&embeds[]=${quoteUrl}`;
    
    if (testMode) {
      toast.success('🧪 Test Mode: Would share to Warpcast');
      // Clear approval state and close
      clearApprovalState();
      onClose();
      return;
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
    
    // Clear approval state and close
    clearApprovalState();
    onClose();
  };

  // Cleanup test mode timeouts
  useEffect(() => {
    return () => {
      if (testModeTimeoutRef.current) {
        clearTimeout(testModeTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup signer polling when popup closes
  useEffect(() => {
    // When popup closes, clear the approval state to stop polling
    if (!isOpen && !testMode) {
      console.log('Popup closed, clearing approval state to stop polling');
      clearApprovalState();
    }
  }, [isOpen, testMode, clearApprovalState]);

  // Determine if user has actually claimed based on database check
  const hasActuallyClaimedSomething = testMode ? hasAlreadyClaimed : actualClaimStatus.hasClaimedAny;

  // POPUP DISABLED - Return null to hide the popup completely
  return null;

  if (hasActuallyClaimedSomething) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={true}>
        <CustomDialogContent className="p-0 overflow-hidden">
          <div className="flex flex-col items-center justify-center text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
            >
              <Check className="h-16 w-16 text-green-500" />
            </motion.div>

            <div className="p-6 pt-4 space-y-4 w-full">
              <motion.h2 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground"
              >
                Already Claimed
              </motion.h2>

              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground text-sm"
              >
                Thank you for supporting the project!
              </motion.p>

              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full flex justify-center"
              >
                <Button 
                  variant="default" 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md h-9"
                  onClick={onClose}
                >
                  Continue
                </Button>
              </motion.div>
            </div>
          </div>
        </CustomDialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={true}>
      <CustomDialogContent className="p-0 overflow-hidden">
        {testMode && (
          <div className="absolute top-2 left-2 bg-amber-500 text-amber-900 px-2 py-1 rounded text-xs font-bold z-50">
            🧪 TEST
          </div>
        )}
        <div className="flex flex-col items-center justify-center text-center">
          {claimState === 'select' && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
              >
                <img 
                  src="/qrLogoWebsite.png" 
                  alt="QR Token" 
                  className="w-28 h-28"
                />
              </motion.div>

              <div className="p-6 pt-4 space-y-4 w-full">
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Support QR to earn $QR!
                </motion.h2>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground text-sm px-2"
                >
                  Opt-in to auto-like/recast our daily winner announcements & other important casts
                </motion.p>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full space-y-4"
                >
                  {/* Likes and Recasts side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Likes Toggle */}
                    <div className="flex flex-col items-center p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <HeartIcon className="h-5 w-5 text-red-500" />
                        <span className="font-semibold text-sm">Likes</span>
                      </div>
                      <button
                        onClick={() => setLikesEnabled(!likesEnabled)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors mb-2",
                          likesEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full transition-transform flex items-center justify-center",
                            likesEnabled ? "translate-x-6 bg-white" : "translate-x-1 bg-white dark:bg-gray-100"
                          )}
                        >
                          {likesEnabled ? (
                            <Check className="h-2 w-2 text-green-600" />
                          ) : (
                            <XIcon className="h-2 w-2 text-red-600" />
                          )}
                        </span>
                      </button>
                      <div className={cn(
                        "text-xs transition-all",
                        likesEnabled ? "text-primary" : "text-muted-foreground line-through"
                      )}>
                        +1,000 $QR
                      </div>
                    </div>

                    {/* Recasts Toggle */}
                    <div className="flex flex-col items-center p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <RecastIcon className="h-5 w-5 text-green-500" />
                        <span className="font-semibold text-sm">Recasts</span>
                      </div>
                      <button
                        onClick={() => setRecastsEnabled(!recastsEnabled)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors mb-2",
                          recastsEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full transition-transform flex items-center justify-center",
                            recastsEnabled ? "translate-x-6 bg-white" : "translate-x-1 bg-white dark:bg-gray-100"
                          )}
                        >
                          {recastsEnabled ? (
                            <Check className="h-2 w-2 text-green-600" />
                          ) : (
                            <XIcon className="h-2 w-2 text-red-600" />
                          )}
                        </span>
                      </button>
                      <div className={cn(
                        "text-xs transition-all",
                        recastsEnabled ? "text-primary" : "text-muted-foreground line-through"
                      )}>
                        +1,000 $QR
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="w-full flex justify-center mt-4"
                >
                  <Button 
                    variant="default" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md focus:outline-none focus:ring-0 h-9"
                    onClick={handleClaim}
                    disabled={!hasAnyPermission}
                  >
                    Confirm
                  </Button>
                </motion.div>
              </div>
            </>
          )}

          {claimState === 'claiming' && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
              >
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
              </motion.div>

              <div className="p-6 pt-4 space-y-4 w-full">
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Processing...
                </motion.h2>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground text-sm"
                >
                  Setting up permissions
                </motion.p>

                {/* Spacer div to match button height in other states */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center"
                >
                  <div className="h-9"></div>
                </motion.div>
              </div>
            </>
          )}

          {claimState === 'signer_approval' && (
            <>
              {(() => {
                const isMobile = typeof window !== 'undefined' && (
                  navigator.userAgent === "warpcast" || 
                  /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                );
                
                return isMobile ? (
                  // Mobile: Show QR logo in circle container
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-28 h-28 rounded-full flex items-center justify-center bg-secondary mt-6"
              >
                <img 
                  src="/qrLogoWebsite.png" 
                  alt="QR Logo" 
                  className="w-28 h-28"
                />
              </motion.div>
                ) : null; // Desktop: No top spacing or icon area
              })()}

              <div className="p-6 space-y-4 w-full">
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground text-center"
                >
                  Review Permissions
                </motion.h2>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <QRCodeDisplay 
                    value={testMode ? TEST_MODE_CONFIG.MOCK_QR_URL : (signerApprovalUrl || '')} 
                    testMode={testMode}
                  />
                </motion.div>
              </div>
            </>
          )}

          {claimState === 'signer_approved' && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-28 h-28 rounded-full flex items-center justify-center bg-purple-500/20 mt-6"
              >
                <Check className="h-16 w-16 text-purple-500" />
              </motion.div>

              <div className="p-6 pt-4 space-y-4 w-full">
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Approved!
                </motion.h2>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground text-sm mb-5"
                >
                  Thank you for supporting @qrcoindotfun
                </motion.p>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center"
                >
                  <Button 
                    variant="default" 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-md h-9"
                    onClick={handleManualClaim}
                  >
                    Claim {testMode ? claimAmount.toLocaleString() : (pendingClaim?.amount?.toLocaleString() || claimAmount.toLocaleString())} $QR
                  </Button>
                </motion.div>
              </div>
            </>
          )}

          {claimState === 'success' && (
            <>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-28 h-28 rounded-full flex items-center justify-center bg-green-500/20 mt-6"
              >
                <Check className="h-16 w-16 text-green-500" />
              </motion.div>

              <div className="p-6 pt-4 space-y-4 w-full">
                <motion.h2 
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-foreground"
                >
                  Claim Successful!
                </motion.h2>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground text-sm mb-4"
                >
                  {claimAmount.toLocaleString()} $QR has been sent to your wallet.
                </motion.p>

                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="w-full flex justify-center"
                >
                  <Button 
                    variant="default" 
                    className="bg-[#472B92] hover:bg-[#3b2277] text-white px-6 py-2 rounded-md flex items-center focus:outline-none focus:ring-0 h-9"
                    onClick={handleShare}
                  >
                    {testMode ? 'Test Share' : 'Share'}
                  </Button>
                </motion.div>
              </div>
            </>
          )}
        </div>
      </CustomDialogContent>
    </Dialog>
  );
}

// Developer utility component to toggle test mode (only shows in development)
export function TestModeToggle() {
  const [testModeEnabled, setTestModeEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('likes-popup-test-mode') === 'true';
  });

  const toggleTestMode = () => {
    const newValue = !testModeEnabled;
    setTestModeEnabled(newValue);
    localStorage.setItem('likes-popup-test-mode', newValue.toString());
    
    if (newValue) {
      toast.success('🧪 Test Mode Enabled for Likes/Recasts Popup');
    } else {
      toast.info('Test Mode Disabled for Likes/Recasts Popup');
    }
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant={testModeEnabled ? "default" : "outline"}
        size="sm"
        onClick={toggleTestMode}
        className="bg-amber-500 hover:bg-amber-600 text-amber-900 border-amber-400"
      >
        {testModeEnabled ? '🧪 Test Mode ON' : '🧪 Test Mode OFF'}
      </Button>
    </div>
  );
} 