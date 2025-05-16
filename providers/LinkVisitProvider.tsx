import React, { createContext, useState, useContext, useEffect } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';
import { useAirdrop } from './AirdropProvider';
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client once, outside the component
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Define context type
interface LinkVisitContextType {
  showClaimPopup: boolean;
  setShowClaimPopup: (show: boolean) => void;
  hasClicked: boolean;
  hasClaimed: boolean;
  isLoading: boolean;
  auctionId: number;
  winningUrl: string;
  winningImage: string;
  isLatestWonAuction: boolean;
}

// Create context with default values
const LinkVisitContext = createContext<LinkVisitContextType>({
  showClaimPopup: false,
  setShowClaimPopup: () => {},
  hasClicked: false,
  hasClaimed: false,
  isLoading: true,
  auctionId: 0,
  winningUrl: '',
  winningImage: '',
  isLatestWonAuction: false
});

// Hook to use the link visit context
export const useLinkVisit = () => useContext(LinkVisitContext);

export function LinkVisitProvider({ 
  children,
  auctionId,
  winningUrl,
  winningImage
}: { 
  children: React.ReactNode,
  auctionId: number,
  winningUrl: string,
  winningImage: string
}) {
  const [showClaimPopup, setShowClaimPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  const [isLatestWonAuction, setIsLatestWonAuction] = useState(false);
  const [isCheckingLatestAuction, setIsCheckingLatestAuction] = useState(true);
  
  // Get access to AirdropProvider context to show the airdrop popup later
  const { setShowAirdropPopup, isEligible, hasClaimed: hasAirdropClaimed } = useAirdrop();
  
  const { 
    hasClicked, 
    hasClaimed, 
    isLoading, 
    walletAddress, 
    frameContext
  } = useLinkVisitEligibility(auctionId);
  
  const { claimTokens } = useLinkVisitClaim(auctionId);
  
  // Check if this auction is the latest won auction using Supabase
  useEffect(() => {
    async function checkLatestWonAuction() {
      try {
        setIsCheckingLatestAuction(true);
        
        // Query the winners table to get the latest auction
        const { data: latestWinner, error } = await supabase
          .from('winners')
          .select('token_id')
          .order('token_id', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error('Error fetching latest won auction:', error);
          return;
        }
        
        if (latestWinner && latestWinner.length > 0) {
          const latestTokenId = parseInt(latestWinner[0].token_id);
          const isLatest = auctionId === latestTokenId || auctionId === latestTokenId + 1;
          console.log(`Auction ${auctionId} is${isLatest ? '' : ' not'} the latest won auction (${latestTokenId})`);
          setIsLatestWonAuction(isLatest);
        } else {
          console.log('No won auctions found');
          setIsLatestWonAuction(false);
        }
      } catch (error) {
        console.error('Error checking latest won auction:', error);
      } finally {
        setIsCheckingLatestAuction(false);
      }
    }
    
    checkLatestWonAuction();
  }, [auctionId]);
  
  // Reset eligibility check when hasClicked or hasClaimed changes
  useEffect(() => {
    console.log('Link visit status changed:', { hasClicked, hasClaimed });
    if (!hasClaimed) {
      console.log('Resetting eligibility check');
      setHasCheckedEligibility(false);
    }
  }, [hasClicked, hasClaimed]);
  
  // Debug logs
  useEffect(() => {
    console.log('===== LINK VISIT PROVIDER DEBUG =====');
    console.log('auctionId:', auctionId);
    console.log('hasClicked:', hasClicked);
    console.log('hasClaimed:', hasClaimed);
    console.log('isLoading:', isLoading);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showClaimPopup:', showClaimPopup);
    console.log('winningUrl:', winningUrl);
    console.log('frameContext?.user?.fid:', frameContext?.user?.fid);
    console.log('isLatestWonAuction:', isLatestWonAuction);
    console.log('isCheckingLatestAuction:', isCheckingLatestAuction);
    console.log('airdrop isEligible:', isEligible);
    console.log('airdrop hasClaimed:', hasAirdropClaimed);
  }, [auctionId, hasClicked, hasClaimed, isLoading, hasCheckedEligibility, walletAddress, showClaimPopup, winningUrl, frameContext, isLatestWonAuction, isCheckingLatestAuction, isEligible, hasAirdropClaimed]);
  
  // Show popup when user can interact with it
  useEffect(() => {
    // Only check once and when data is loaded
    if (hasCheckedEligibility || isLoading || !walletAddress || isCheckingLatestAuction) {
      console.log('Early return from popup check:', { 
        hasCheckedEligibility, 
        isLoading, 
        walletConnected: !!walletAddress,
        isCheckingLatestAuction
      });
      return;
    }
    
    console.log('Checking if should show popup:', {
      hasClicked,
      hasClaimed,
      auctionId,
      isLatestWonAuction
    });
    
    // Only show popup if the user hasn't claimed and this is the latest won auction
    if (!hasClaimed && isLatestWonAuction) {
      console.log('SHOWING POPUP - User has not claimed tokens for this auction and it is the latest won auction');
      
      // Short delay to show popup after page loads
      const timer = setTimeout(() => {
        console.log('Setting showClaimPopup to TRUE');
        setShowClaimPopup(true);
        setHasCheckedEligibility(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      if (hasClaimed) {
        console.log('NOT showing popup - User already claimed');
      } else if (!isLatestWonAuction) {
        console.log('NOT showing popup - This is not the latest won auction');
      }
      setHasCheckedEligibility(true);
    }
  }, [hasClicked, hasClaimed, isLoading, hasCheckedEligibility, walletAddress, auctionId, isLatestWonAuction, isCheckingLatestAuction]);
  
  // Handle claim action
  const handleClaim = async () => {
    console.log('Handling claim in provider...');
    // Wallet should already be connected
    return await claimTokens();
  };
  
  // Close popup and show the airdrop popup if eligible
  const handleClose = () => {
    console.log('Closing link visit popup, checking if airdrop popup should show...');
    setShowClaimPopup(false);
    
    // Show the airdrop popup after a short delay
    setTimeout(() => {
      // Only show the airdrop popup if user is eligible and hasn't claimed yet
      if (isEligible === true && !hasAirdropClaimed) {
        console.log('User is eligible for airdrop, triggering airdrop popup...');
        setShowAirdropPopup(true);
      } else {
        console.log('User is not eligible for airdrop or has already claimed, not showing airdrop popup');
      }
    }, 500);
  };
  
  return (
    <LinkVisitContext.Provider
      value={{
        showClaimPopup,
        setShowClaimPopup,
        hasClicked,
        hasClaimed,
        isLoading,
        auctionId,
        winningUrl,
        winningImage,
        isLatestWonAuction
      }}
    >
      {children}
      
      <LinkVisitClaimPopup
        isOpen={showClaimPopup}
        onClose={handleClose}
        hasClicked={hasClicked}
        winningUrl={winningUrl}
        winningImage={winningImage}
        auctionId={auctionId}
        onClaim={handleClaim}
      />
    </LinkVisitContext.Provider>
  );
} 