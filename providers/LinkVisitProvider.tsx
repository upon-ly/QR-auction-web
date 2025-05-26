import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';
import { createClient } from "@supabase/supabase-js";
import { getAuctionImage } from '@/utils/auctionImageOverrides';

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
  latestWonAuctionId: number | null;
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
  isLatestWonAuction: false,
  latestWonAuctionId: null
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
  const [latestWonAuctionId, setLatestWonAuctionId] = useState<number | null>(null);
  const [latestWinningUrl, setLatestWinningUrl] = useState<string>('');
  const [latestWinningImage, setLatestWinningImage] = useState<string>('');
  const [manualHasClaimedLatest, setManualHasClaimedLatest] = useState<boolean | null>(null);
  const [explicitlyCheckedClaim, setExplicitlyCheckedClaim] = useState(false);
  
  // Get popup coordinator to manage popup display
  const { requestPopup, releasePopup, isPopupActive } = usePopupCoordinator();

  // Sync local state with coordinator state
  useEffect(() => {
    const isActive = isPopupActive('linkVisit');
    if (isActive !== showClaimPopup) {
      setShowClaimPopup(isActive);
    }
  }, [isPopupActive, showClaimPopup]);
  
  // Use the latestWonAuctionId for eligibility checks, falling back to current auction
  const eligibilityAuctionId = latestWonAuctionId !== null ? latestWonAuctionId : auctionId;
  
  const { 
    hasClicked, 
    hasClaimed, 
    isLoading, 
    walletAddress, 
    frameContext
  } = useLinkVisitEligibility(eligibilityAuctionId);
  
  // ALWAYS use the latestWonAuctionId for claim operations - never fall back to current auction
  // This prevents gaming by manually visiting future auction URLs
  const claimAuctionId = latestWonAuctionId;
  const { claimTokens } = useLinkVisitClaim(claimAuctionId || 0);

  // Explicit function to check claim status directly from database
  const checkClaimStatusForLatestAuction = useCallback(async () => {
    console.log('Explicitly checking claim status for latest auction');
    
    // Skip if no wallet, frame context, or latest auction ID
    if (!walletAddress || !frameContext?.user?.fid || !latestWonAuctionId) {
      console.log('Cannot check claim status: missing wallet, fid, or auctionId');
      setManualHasClaimedLatest(false);
      setExplicitlyCheckedClaim(true);
      return false;
    }
    
    try {
      console.log(`Checking claim status for FID=${frameContext.user.fid}, auctionId=${latestWonAuctionId}`);
      
      // Direct DB query to check if claimed
      const { data, error } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('fid', frameContext.user.fid)
        .eq('auction_id', latestWonAuctionId)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking claim status:', error);
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        return false;
      }
      
      // Determine if user has claimed based on claimed_at field
      const hasClaimed = !!(data && data.claimed_at);
      console.log('Explicit claim check result:', { hasClaimed, record: data });
      
      setManualHasClaimedLatest(hasClaimed);
      setExplicitlyCheckedClaim(true);
      return hasClaimed;
    } catch (error) {
      console.error('Unexpected error checking claim status:', error);
      setManualHasClaimedLatest(false);
      setExplicitlyCheckedClaim(true);
      return false;
    }
  }, [latestWonAuctionId, walletAddress, frameContext]);
  
  // Check if this auction is the latest won auction using Supabase
  useEffect(() => {
    async function checkLatestWonAuction() {
      try {
        setIsCheckingLatestAuction(true);
        setExplicitlyCheckedClaim(false); // Reset claim check flag when getting new auction data
        
        // Query the winners table to get the latest auction
        const { data: latestWinner, error } = await supabase
          .from('winners')
          .select('token_id, url')
          .order('token_id', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error('Error fetching latest won auction:', error);
          return;
        }
        
        if (latestWinner && latestWinner.length > 0) {
          const latestTokenId = parseInt(latestWinner[0].token_id);
          setLatestWonAuctionId(latestTokenId);
          
          // Set the winning URL from the winner data
          if (latestWinner[0].url) {
            setLatestWinningUrl(latestWinner[0].url);
          }
          
          // Check if we have a hardcoded image for this auction ID
          const tokenIdStr = latestTokenId.toString();
          // Use the utility function to get the image
          const overrideImage = await getAuctionImage(tokenIdStr);
          if (overrideImage) {
            setLatestWinningImage(overrideImage);
          } else {
            // If no override exists, fetch from OG API
            try {
              const url = latestWinner[0].url || '';
              const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              
              if (data.error || !data.image) {
                setLatestWinningImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
              } else {
                setLatestWinningImage(data.image);
              }
            } catch (err) {
              console.error('Error fetching OG image:', err);
              setLatestWinningImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
            }
          }
          
          // Current auction is eligible if it's the won auction or the next one
          const isLatest = auctionId === latestTokenId || auctionId === latestTokenId + 1;
          console.log(`Auction ${auctionId} is${isLatest ? '' : ' not'} eligible (latest won auction: ${latestTokenId})`);
          setIsLatestWonAuction(isLatest);
        } else {
          console.log('No won auctions found');
          setIsLatestWonAuction(false);
          setLatestWonAuctionId(null);
        }
      } catch (error) {
        console.error('Error checking latest won auction:', error);
      } finally {
        setIsCheckingLatestAuction(false);
      }
    }
    
    checkLatestWonAuction();
  }, [auctionId]);
  
  // Perform explicit claim check when we get latest auction ID and wallet/frame context
  useEffect(() => {
    // Only perform check if we have all necessary data and haven't checked yet
    if (latestWonAuctionId && walletAddress && frameContext?.user?.fid && !explicitlyCheckedClaim) {
      console.log('Triggering explicit claim check for latest auction');
      checkClaimStatusForLatestAuction();
    }
  }, [latestWonAuctionId, walletAddress, frameContext, explicitlyCheckedClaim, checkClaimStatusForLatestAuction]);
  
  // Reset eligibility check when hasClicked or hasClaimed or manualHasClaimedLatest changes
  useEffect(() => {
    console.log('Link visit status changed:', { 
      hasClicked, 
      hasClaimed, 
      manualHasClaimedLatest 
    });
    
    if (!hasClaimed && manualHasClaimedLatest !== true) {
      console.log('Resetting eligibility check');
      setHasCheckedEligibility(false);
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest]);
  
  // Debug logs
  useEffect(() => {
    console.log('===== LINK VISIT PROVIDER DEBUG =====');
    console.log('auctionId:', auctionId);
    console.log('claimAuctionId (for recording claims):', claimAuctionId);
    console.log('latestWonAuctionId:', latestWonAuctionId);
    console.log('latestWinningUrl:', latestWinningUrl);
    console.log('latestWinningImage:', latestWinningImage);
    console.log('hasClicked:', hasClicked);
    console.log('hasClaimed:', hasClaimed);
    console.log('manualHasClaimedLatest:', manualHasClaimedLatest);
    console.log('explicitlyCheckedClaim:', explicitlyCheckedClaim); 
    console.log('isLoading:', isLoading);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showClaimPopup:', showClaimPopup);
    console.log('frameContext?.user?.fid:', frameContext?.user?.fid);
    console.log('isLatestWonAuction:', isLatestWonAuction);
    console.log('isCheckingLatestAuction:', isCheckingLatestAuction);
    console.log('isPopupActive:', isPopupActive('linkVisit'));
  }, [auctionId, claimAuctionId, latestWonAuctionId, latestWinningUrl, latestWinningImage, 
      hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, 
      hasCheckedEligibility, walletAddress, showClaimPopup, frameContext, isLatestWonAuction, 
      isCheckingLatestAuction, isPopupActive]);
  
  // Listen for trigger from other popups closing
  useEffect(() => {
    const handleTrigger = () => {
      console.log('===== LINK VISIT TRIGGERED BY OTHER POPUP =====');
      
      // Check if user is eligible (hasn't claimed for latest won auction)
      if (manualHasClaimedLatest === false && latestWonAuctionId && walletAddress && !isLoading && explicitlyCheckedClaim) {
        console.log('🎉 TRIGGERED - SHOWING LINK VISIT POPUP');
        const granted = requestPopup('linkVisit');
        if (granted) {
          setShowClaimPopup(true);
        }
      } else {
        console.log('❌ Triggered but user not eligible for link visit');
      }
      setHasCheckedEligibility(true);
    };
    
    window.addEventListener('triggerLinkVisitPopup', handleTrigger);
    return () => window.removeEventListener('triggerLinkVisitPopup', handleTrigger);
  }, [manualHasClaimedLatest, latestWonAuctionId, walletAddress, isLoading, explicitlyCheckedClaim, requestPopup]);
  
  // Show popup when user can interact with it (ENABLED - shows independently if eligible)
  useEffect(() => {
    // LinkVisit popup can now auto-show if user is eligible
    console.log('LinkVisit auto-show is enabled - checking eligibility independently');
    
    // Ensure we have explicitly checked claim status before showing popup
    if (!explicitlyCheckedClaim) {
      console.log('Not showing popup - explicit claim check not completed yet');
      return;
    }
    
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
      manualHasClaimedLatest,
      auctionId,
      latestWonAuctionId
    });
    
    // Only show popup if the user hasn't claimed for the latest won auction
    // Using our explicit DB check as the source of truth
    if (manualHasClaimedLatest === false && latestWonAuctionId) {
      console.log('SHOWING POPUP - User has not claimed tokens for the latest won auction');
      
      // Moderate delay to show popup after other popups
      const timer = setTimeout(() => {
        console.log('Requesting linkVisit popup from coordinator');
        const granted = requestPopup('linkVisit');
        if (granted) {
          setShowClaimPopup(true);
        }
        setHasCheckedEligibility(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    } else {
      if (manualHasClaimedLatest === true) {
        console.log('NOT showing popup - User already claimed (confirmed with DB)');
      } else if (!latestWonAuctionId) {
        console.log('NOT showing popup - No latest won auction found');
      }
      setHasCheckedEligibility(true);
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, hasCheckedEligibility, walletAddress, auctionId, latestWonAuctionId, isCheckingLatestAuction]);
  
  // Handle claim action
  const handleClaim = async () => {
    console.log('Handling claim in provider...', { claimAuctionId });
    // Wallet should already be connected
    const result = await claimTokens();
    
    // Update our manual tracking state after claim
    if (result.txHash) {
      setManualHasClaimedLatest(true);
    }
    
    return result;
  };
  
  // Close popup
  const handleClose = () => {
    console.log('Closing link visit popup');
    setShowClaimPopup(false);
    releasePopup('linkVisit');
  };
  
  return (
    <LinkVisitContext.Provider
      value={{
        showClaimPopup,
        setShowClaimPopup,
        hasClicked,
        hasClaimed: manualHasClaimedLatest === true || hasClaimed, // Use combined claim status
        isLoading,
        auctionId,
        winningUrl,
        winningImage,
        isLatestWonAuction,
        latestWonAuctionId
      }}
    >
      {children}
      
      <LinkVisitClaimPopup
        isOpen={showClaimPopup}
        onClose={handleClose}
        hasClicked={hasClicked}
        winningUrl={latestWinningUrl || winningUrl}
        winningImage={latestWinningImage || winningImage}
        auctionId={claimAuctionId || 0}
        onClaim={handleClaim}
      />
    </LinkVisitContext.Provider>
  );
} 