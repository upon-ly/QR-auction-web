import React, { createContext, useState, useContext, useEffect } from 'react';
import { useLikesRecastsEligibility } from '@/hooks/useLikesRecastsEligibility';
import { LikesRecastsClaimPopup } from '@/components/LikesRecastsClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';

// Define context type
interface LikesRecastsContextType {
  showLikesRecastsPopup: boolean;
  setShowLikesRecastsPopup: (show: boolean) => void;
  isEligible: boolean | null;
  isLoading: boolean;
  hasClaimedEither: boolean;
}

// Create context with default values
const LikesRecastsContext = createContext<LikesRecastsContextType>({
  showLikesRecastsPopup: false,
  setShowLikesRecastsPopup: () => {},
  isEligible: null,
  isLoading: true,
  hasClaimedEither: false,
});

// Hook to use the likes/recasts context
export const useLikesRecasts = () => useContext(LikesRecastsContext);

interface LikesRecastsProviderProps {
  children: React.ReactNode;
  onPopupComplete?: () => void; // Callback when this popup is done
}

export function LikesRecastsProvider({ children, onPopupComplete }: LikesRecastsProviderProps) {
  const [showLikesRecastsPopup, setShowLikesRecastsPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  
  const { 
    isEligible, 
    isLoading, 
    hasClaimedEither,
    hasSignerApproval,
    walletAddress
  } = useLikesRecastsEligibility();
  
  // Get popup coordinator to manage popup display
  const { requestPopup, releasePopup, isPopupActive } = usePopupCoordinator();
  
  // Sync local state with coordinator state
  useEffect(() => {
    const isActive = isPopupActive('likesRecasts');
    if (isActive !== showLikesRecastsPopup) {
      setShowLikesRecastsPopup(isActive);
    }
  }, [isPopupActive, showLikesRecastsPopup]);

  // Debug logs
  useEffect(() => {
    console.log('===== LIKES/RECASTS PROVIDER DEBUG =====');
    console.log('isEligible:', isEligible);
    console.log('isLoading:', isLoading);
    console.log('hasClaimedEither:', hasClaimedEither);
    console.log('hasSignerApproval:', hasSignerApproval);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showLikesRecastsPopup:', showLikesRecastsPopup);
    console.log('isPopupActive:', isPopupActive('likesRecasts'));
  }, [isEligible, isLoading, hasClaimedEither, hasSignerApproval, hasCheckedEligibility, walletAddress, showLikesRecastsPopup, isPopupActive]);
  
  // Reset eligibility check when wallet address changes or eligibility is being recalculated
  useEffect(() => {
    if (walletAddress && isLoading) {
      console.log('Resetting hasCheckedEligibility - eligibility being recalculated');
      setHasCheckedEligibility(false);
    }
  }, [walletAddress, isLoading]);

  // No need for auto-show disabling logic - coordinator handles this
  
  // Auto-show popup when user is eligible
  useEffect(() => {

    console.log('===== LIKES/RECASTS AUTO-SHOW CHECK =====', {
      hasCheckedEligibility,
      isLoading,
      walletAddress,
      showLikesRecastsPopup,
      isEligible,
      hasClaimedEither,
      hasSignerApproval
    });
    
    // Skip if already checked or still loading
    if (hasCheckedEligibility) {
      console.log('SKIPPING: Already checked eligibility');
      return;
    }
    
    if (isLoading) {
      console.log('SKIPPING: Still loading');
      return;
    }
    
    if (!walletAddress) {
      console.log('SKIPPING: No wallet address');
      return;
    }
    
    // Skip if popup is already showing (to avoid conflicts with manual triggering)
    if (showLikesRecastsPopup) {
      console.log('SKIPPING: Popup already showing');
      return;
    }
    
    // Skip if eligibility is still being determined (null)
    if (isEligible === null) {
      console.log('SKIPPING: Eligibility still being determined (null)');
      return;
    }
    
    // Show popup if user is eligible and hasn't claimed
    if (isEligible === true && !hasClaimedEither) {
      // Show popup whether they have signer approval or not
      // If they have approval, the popup will skip to claim state
      // If they don't have approval, the popup will start with permissions
      console.log('🎉 ALL CONDITIONS MET - SHOWING LIKES/RECASTS POPUP');
      console.log('Has signer approval:', hasSignerApproval);
      
      const timer = setTimeout(() => {
        console.log('Timer fired - requesting popup from coordinator');
        const granted = requestPopup('likesRecasts');
        if (granted) {
          setShowLikesRecastsPopup(true);
        }
        setHasCheckedEligibility(true);
      }, 1000); // Show after 1 second
      
      return () => {
        console.log('Cleaning up timer');
        clearTimeout(timer);
      };
    } else if (isEligible === false) {
      // Only set as checked if user is definitely not eligible
      console.log('❌ User is not eligible for likes/recasts popup');
      setHasCheckedEligibility(true);
    } else if (hasClaimedEither) {
      console.log('❌ User has already claimed either option');
      setHasCheckedEligibility(true);
    } else {
      console.log('❓ Unknown condition preventing popup');
    }
  }, [isEligible, isLoading, hasClaimedEither, hasSignerApproval, hasCheckedEligibility, walletAddress, showLikesRecastsPopup, requestPopup]);
  
  // This provider will be triggered by the main AirdropProvider
  // It won't auto-show the popup, but will wait to be told when to show
  useEffect(() => {
    // When popup is closed, notify parent
    if (!showLikesRecastsPopup && hasCheckedEligibility && onPopupComplete) {
      onPopupComplete();
    }
  }, [showLikesRecastsPopup, hasCheckedEligibility, onPopupComplete]);
  
  // Mark as checked when popup is shown
  useEffect(() => {
    if (showLikesRecastsPopup && !hasCheckedEligibility) {
      setHasCheckedEligibility(true);
    }
  }, [showLikesRecastsPopup, hasCheckedEligibility]);
  
  // Close popup
  const handleClose = () => {
    console.log('Closing likes/recasts popup');
    setShowLikesRecastsPopup(false);
    releasePopup('likesRecasts');
  };
  
  return (
    <LikesRecastsContext.Provider
      value={{
        showLikesRecastsPopup,
        setShowLikesRecastsPopup,
        isEligible,
        isLoading,
        hasClaimedEither
      }}
    >
      {children}
      
      <LikesRecastsClaimPopup
        isOpen={showLikesRecastsPopup}
        onClose={handleClose}
        hasAlreadyClaimed={hasClaimedEither}
      />
    </LikesRecastsContext.Provider>
  );
} 