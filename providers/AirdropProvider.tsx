import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAirdropEligibility } from '@/hooks/useAirdropEligibility';
import { useClaimAirdrop } from '@/hooks/useClaimAirdrop';
import { AirdropClaimPopup } from '@/components/AirdropClaimPopup';

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Define context type
interface AirdropContextType {
  showAirdropPopup: boolean;
  setShowAirdropPopup: (show: boolean) => void;
  isEligible: boolean | null;
  isLoading: boolean;
  hasClaimed: boolean;
  isTestUser: boolean;
}

// Create context with default values
const AirdropContext = createContext<AirdropContextType>({
  showAirdropPopup: false,
  setShowAirdropPopup: () => {},
  isEligible: null,
  isLoading: true,
  hasClaimed: false,
  isTestUser: false,
});

// Hook to use the airdrop context
export const useAirdrop = () => useContext(AirdropContext);

export function AirdropProvider({ children }: { children: React.ReactNode }) {
  const [showAirdropPopup, setShowAirdropPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  
  const { 
    isEligible, 
    isLoading, 
    hasClaimed, 
    walletAddress, 
    hasAddedFrame,
    hasNotifications,
    frameContext
  } = useAirdropEligibility();
  
  const { claimAirdrop } = useClaimAirdrop();
  
  // Check if current user is the test user
  const isTestUser = frameContext?.user?.username === TEST_USERNAME;
  
  // Reset eligibility check when hasAddedFrame or hasNotifications changes
  // This ensures we re-check when eligibility changes due to polling
  useEffect(() => {
    console.log('Frame status changed: hasAddedFrame or hasNotifications updated');
    if (hasAddedFrame && hasNotifications && !hasClaimed) {
      console.log('Resetting eligibility check due to frame status update');
      setHasCheckedEligibility(false);
    }
  }, [hasAddedFrame, hasNotifications, hasClaimed]);
  
  // Reset eligibility check when isEligible changes
  // This ensures we re-check when eligibility is finally determined
  useEffect(() => {
    console.log('isEligible changed to:', isEligible);
    if (isEligible === true) {
      setHasCheckedEligibility(false);
    }
  }, [isEligible]);
  
  // Debug logs
  useEffect(() => {
    console.log('===== AIRDROP PROVIDER DEBUG =====');
    console.log('isTestUser:', isTestUser);
    console.log('isEligible:', isEligible);
    console.log('isLoading:', isLoading);
    console.log('hasClaimed:', hasClaimed);
    console.log('hasAddedFrame:', hasAddedFrame);
    console.log('hasNotifications:', hasNotifications);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showAirdropPopup:', showAirdropPopup);
  }, [isTestUser, isEligible, isLoading, hasClaimed, hasAddedFrame, hasNotifications, hasCheckedEligibility, walletAddress, showAirdropPopup]);
  
  // Show popup when user is eligible and has not claimed yet
  useEffect(() => {
    // Only check once and when user has wallet connected
    if (hasCheckedEligibility || isLoading || !walletAddress) {
      console.log('Early return from popup check:', { 
        hasCheckedEligibility, 
        isLoading, 
        walletConnected: !!walletAddress 
      });
      return;
    }
    
    console.log('Checking if should show popup:', {
      isEligible,
      hasClaimed,
      hasAddedFrame,
      hasNotifications,
      isTestUser
    });
    
    // Only show popup if user is eligible, hasn't claimed already, has frame and notifications
    if (isEligible === true && !hasClaimed && hasAddedFrame && hasNotifications) {
      console.log('SHOWING POPUP - User is eligible for airdrop with all conditions met');
      
      // Short delay to show popup after page loads
      const timer = setTimeout(() => {
        console.log('Setting showAirdropPopup to TRUE');
        setShowAirdropPopup(true);
        setHasCheckedEligibility(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      console.log('NOT showing popup - One or more conditions failed');
      setHasCheckedEligibility(true);
    }
  }, [isEligible, isLoading, hasClaimed, hasCheckedEligibility, walletAddress, hasAddedFrame, hasNotifications, isTestUser]);
  
  // Handle claim action
  const handleClaim = async () => {
    // Wallet should already be connected by FarcasterLogin component
    return await claimAirdrop();
  };
  
  // Close popup
  const handleClose = () => {
    setShowAirdropPopup(false);
  };
  
  return (
    <AirdropContext.Provider
      value={{
        showAirdropPopup,
        setShowAirdropPopup,
        isEligible,
        isLoading,
        hasClaimed,
        isTestUser
      }}
    >
      {children}
      
      <AirdropClaimPopup
        isOpen={showAirdropPopup}
        onClose={handleClose}
        onClaim={handleClaim}
        isEligible={isEligible === true && !hasClaimed && hasAddedFrame && hasNotifications}
      />
    </AirdropContext.Provider>
  );
} 