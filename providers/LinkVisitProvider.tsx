import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { useRedirectClickTracking } from '@/hooks/useRedirectClickTracking';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';
import { createClient } from "@supabase/supabase-js";
import { getAuctionImage } from '@/utils/auctionImageOverrides';
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { getFarcasterUser } from '@/utils/farcaster';
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

// Initialize Supabase client once, outside the component
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Global variable to track if popup has been shown in this page session
// This persists across component remounts but resets on page refresh
let hasShownPopupThisPageSession = false;

// Feature flag to disable popup functionality
const POPUP_DISABLED = false;


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
  isWebContext: boolean;
  needsWalletConnection: boolean;
  walletStatusDetermined: boolean;
  authCheckComplete: boolean;
  isCheckingDatabase: boolean;
  isTwitterUserNeedsWallet: boolean;
  isPrivyModalActive: boolean;
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
  latestWonAuctionId: null,
  isWebContext: false,
  needsWalletConnection: false,
  walletStatusDetermined: false,
  authCheckComplete: false,
  isCheckingDatabase: false,
  isTwitterUserNeedsWallet: false,
  isPrivyModalActive: false,
});

// Hook to use the link visit context
export const useLinkVisit = () => useContext(LinkVisitContext);

interface LinkedAccount {
  type: string;
  // Add other properties as needed
}

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
  const [isWebContext, setIsWebContext] = useState(false);
  const [latestWonAuctionId, setLatestWonAuctionId] = useState<number | null>(null);
  const [isLatestWonAuction, setIsLatestWonAuction] = useState(false);
  const [latestWinningUrl, setLatestWinningUrl] = useState<string | null>(null);
  const [latestWinningImage, setLatestWinningImage] = useState<string | null>(null);
  const [manualHasClaimedLatest, setManualHasClaimedLatest] = useState<boolean | null>(null);
  const [explicitlyCheckedClaim, setExplicitlyCheckedClaim] = useState(false);
  const [isCheckingLatestAuction, setIsCheckingLatestAuction] = useState(false);
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  
  // NEW: Flag to prevent multiple wallet connection calls
  const [hasTriggeredWalletConnection, setHasTriggeredWalletConnection] = useState(false);
  
  // NEW: Track if user has dismissed the popup in this session
  const [hasUserDismissedPopup, setHasUserDismissedPopup] = useState(false);
  
  // Web-specific state
  const { authenticated, user } = usePrivy();
  const { address: walletAddress } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  const { connectWallet } = useConnectWallet();
  
  // Get smart wallet address from user's linked accounts (more reliable)
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => account.type === 'smart_wallet')?.address;
  
  // Use appropriate wallet address based on context - prioritize smart wallet for web users
  const effectiveWalletAddress = isWebContext 
    ? (smartWalletAddress || smartWalletClient?.account?.address || walletAddress)
    : walletAddress;
  
  // Add state to track when wallet connection status is determined
  const [walletStatusDetermined, setWalletStatusDetermined] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  
  // NEW: Check if user is authenticated with Twitter or Farcaster
  const isTwitterOrFarcasterUser = useMemo(() => {
    if (!authenticated || !user?.linkedAccounts) return false;
    
    return user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
  }, [authenticated, user?.linkedAccounts]);
  
  // NEW: Check if user has traditional wallet connected (not Twitter/Farcaster)
  const hasTraditionalWalletOnly = useMemo(() => {
    if (!authenticated || !user?.linkedAccounts) return false;
    
    const hasTraditionalWallet = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'wallet' || account.type === 'smart_wallet'
    );
    
    const hasSocialAuth = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
    
    // Has wallet but no social auth
    return hasTraditionalWallet && !hasSocialAuth;
  }, [authenticated, user?.linkedAccounts]);
  
  // Get popup coordinator to manage popup display
  const { requestPopup, releasePopup, isPopupActive } = usePopupCoordinator();
  
  // Helper to get Twitter username from authenticated user
  const getTwitterUsername = useCallback(() => {
    if (!authenticated || !user?.linkedAccounts) return null;
    
    const twitterAccount = user.linkedAccounts.find((account: LinkedAccount & { username?: string }) => 
      account.type === 'twitter_oauth'
    );
    
    return twitterAccount?.username || null;
  }, [authenticated, user?.linkedAccounts]);
  
  // Detect if we're in web context vs mini-app context
  useEffect(() => {
    async function detectContext() {
      try {
        // Check if we're in a mini app
        const { frameSdk } = await import('@/lib/frame-sdk-singleton');
        const isMiniApp = await frameSdk.isInMiniApp() || (await frameSdk.getContext()).client.clientFid == 309857;
        setIsWebContext(!isMiniApp);
      } catch {
        // If check fails, we're in web context
        setIsWebContext(true);
      }
    }
    
    detectContext();
  }, []);

  // For web context, we need to check if wallet is connected
  const needsWalletConnection = isWebContext && !authenticated;
  
  // Track when authentication status is determined (either true or false, but resolved)
  useEffect(() => {
    if (isWebContext) {
      // For web context, we need to wait for Privy to finish initialization
      // After a reasonable delay, consider auth status as determined
      const timer = setTimeout(() => {
        setAuthCheckComplete(true);
      }, 3000); // Give Privy 3 seconds to initialize
      
      return () => clearTimeout(timer);
    } else {
      // For mini-app context, we don't rely on Privy auth
      setAuthCheckComplete(true);
    }
  }, [isWebContext, authenticated]);
  
  // Track when wallet connection status is determined
  useEffect(() => {
    if (!authCheckComplete) return;
    
    if (isWebContext) {
      if (authenticated) {
        // If authenticated, wait for wallet address or determine it's not available
        const timer = setTimeout(() => {
          setWalletStatusDetermined(true);
        }, 2000); // Wait 2 seconds for wallet address to resolve
        
        return () => clearTimeout(timer);
      } else {
        // If not authenticated, wallet status is immediately known (not connected)
        setWalletStatusDetermined(true);
      }
    } else {
      // For mini-app context, wallet status depends on frameContext
      setWalletStatusDetermined(true);
    }
  }, [authCheckComplete, isWebContext, authenticated, effectiveWalletAddress]);
  
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
    frameContext: eligibilityFrameContext
  } = useLinkVisitEligibility(eligibilityAuctionId, isWebContext);
  
  // Check if user has visited the redirect link (only check after we know the latest won auction)
  const { data: redirectClickData, isLoading: isRedirectClickLoading } = useRedirectClickTracking(
    latestWonAuctionId // Use latestWonAuctionId directly, not eligibilityAuctionId
  );
  
  // Direct database check for mini-app users using eligibility frame context
  const [hasVisitedRedirect, setHasVisitedRedirect] = useState(false);
  
  useEffect(() => {
    async function checkRedirectVisit() {
      if (!latestWonAuctionId || !eligibilityFrameContext?.user?.fid || isWebContext) {
        return;
      }
      
      try {
        // Call our API endpoint to check redirect clicks
        const response = await fetch(`/api/link-visit/check-visited?auctionId=${latestWonAuctionId}&fid=${eligibilityFrameContext.user.fid}`);
        const result = await response.json();
          
        if (result.success && result.data?.hasVisited) {
          setHasVisitedRedirect(true);
        }
      } catch {
        // Silently fail - user will see "Today's winner" button
      }
    }
    
    checkRedirectVisit();
  }, [latestWonAuctionId, eligibilityFrameContext?.user?.fid, isWebContext]);
  
  
  // ALWAYS use the latestWonAuctionId for claim operations - never fall back to current auction
  // This prevents gaming by manually visiting future auction URLs
  const claimAuctionId = latestWonAuctionId;
  const { claimTokens, expectedClaimAmount, isCheckingAmount } = useLinkVisitClaim(claimAuctionId || 0, isWebContext);

  // Explicit function to check claim status directly from database
  const checkClaimStatusForLatestAuction = useCallback(async () => {
    setIsCheckingDatabase(true);
    
    // For web context, use wallet address or Twitter username; for mini-app, use FID
    if (isWebContext) {
      const twitterUsername = getTwitterUsername();
      
      // Need either wallet address or Twitter username to check
      if ((!effectiveWalletAddress && !twitterUsername) || !latestWonAuctionId) {
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        
        // Get Farcaster username associated with this address
        let farcasterUsername: string | null = null;
        if (effectiveWalletAddress) {
          try {
            const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
            farcasterUsername = farcasterUser?.username || null;
          } catch {
          }
        }
        
        // Check for ANY claims by wallet address if available
        let allClaims: Array<{
          id: string;
          eth_address?: string;
          username?: string;
          claimed_at?: string;
          link_visited_at?: string;
          auction_id: number;
        }> = [];
        if (effectiveWalletAddress) {
          const { data: addressClaims, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('eth_address', effectiveWalletAddress)
            .eq('auction_id', latestWonAuctionId);
          
          if (!error && addressClaims) {
            allClaims = addressClaims;
          }
        }
        
        // Also check for claims by usernames (Twitter and Farcaster)
        let usernameClaims: typeof allClaims = [];
        const usernamesToCheck = [twitterUsername, farcasterUsername].filter(Boolean);
        
        if (usernamesToCheck.length > 0) {
          for (const username of usernamesToCheck) {
            const { data: usernameClaimsData, error: usernameError } = await supabase
              .from('link_visit_claims')
              .select('*')
              .ilike('username', username!)
              .eq('auction_id', latestWonAuctionId);
            
            if (!usernameError && usernameClaimsData) {
              usernameClaims = [...usernameClaims, ...usernameClaimsData];
            }
          }
        }
        
        // Combine both sets of claims and deduplicate by id
        const allClaimsArray = [...(allClaims || []), ...usernameClaims];
        const combinedClaims = allClaimsArray.filter((claim, index, self) => 
          index === self.findIndex(c => c.id === claim.id)
        );
        
        // Check if ANY claim has claimed_at (regardless of web/mini-app source)
        const hasClaimedInAnyContext = combinedClaims && combinedClaims.some(claim => claim.claimed_at);
        
        setManualHasClaimedLatest(hasClaimedInAnyContext);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimedInAnyContext;
      } catch {
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    } else {
      // Mini-app logic (existing)
      if (!effectiveWalletAddress || !eligibilityFrameContext?.user?.fid || !latestWonAuctionId) {
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        
        // Get the Farcaster username from frame context
        const farcasterUsername = eligibilityFrameContext.user.username;
        
        // Check for ANY claims by this wallet address for this auction (regardless of claim_source)
        const { data: allClaims, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('eth_address', effectiveWalletAddress)
          .eq('auction_id', latestWonAuctionId);
        
        // Also check for claims by the Farcaster username
        let usernameClaims: typeof allClaims = [];
        if (farcasterUsername) {
          const { data: usernameClaimsData, error: usernameError } = await supabase
            .from('link_visit_claims')
            .select('*')
            .ilike('username', farcasterUsername)
            .eq('auction_id', latestWonAuctionId);
          
          if (!usernameError && usernameClaimsData) {
            usernameClaims = usernameClaimsData;
          }
        }
        
        // Combine both sets of claims and deduplicate by id
        const allClaimsArray = [...(allClaims || []), ...usernameClaims];
        const combinedClaims = allClaimsArray.filter((claim, index, self) => 
          index === self.findIndex(c => c.id === claim.id)
        );
        
        if (error) {
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
          return false;
        }
        
        // Check if ANY claim has claimed_at (regardless of web/mini-app source)
        const hasClaimedInAnyContext = combinedClaims && combinedClaims.some(claim => claim.claimed_at);
        
        setManualHasClaimedLatest(hasClaimedInAnyContext);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimedInAnyContext;
      } catch {
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    }
  }, [latestWonAuctionId, effectiveWalletAddress, eligibilityFrameContext, isWebContext, getTwitterUsername]);
  
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
            } catch {
              setLatestWinningImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
            }
          }
          
          // Current auction is eligible if it's the won auction or the next one
          const isLatest = auctionId === latestTokenId || auctionId === latestTokenId + 1;
          setIsLatestWonAuction(isLatest);
        } else {
          setIsLatestWonAuction(false);
          setLatestWonAuctionId(null);
        }
      } catch {
      } finally {
        setIsCheckingLatestAuction(false);
      }
    }
    
    checkLatestWonAuction();
  }, [auctionId]);
  
  // Perform explicit claim check when we get latest auction ID and wallet/frame context
  useEffect(() => {
    // Only perform check if we have all necessary data and haven't checked yet
    if (isWebContext) {
      // Web context: check when wallet status is determined
      if (latestWonAuctionId && !explicitlyCheckedClaim && walletStatusDetermined) {
        if (effectiveWalletAddress) {
          checkClaimStatusForLatestAuction();
        } else {
          // No wallet address (not authenticated), assume no previous claim
          setIsCheckingDatabase(true);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
        }
      }
    } else {
      // Mini-app context: check when we have frame context and wallet status is determined
      if (latestWonAuctionId && eligibilityFrameContext?.user?.fid && !explicitlyCheckedClaim && walletStatusDetermined) {
        checkClaimStatusForLatestAuction();
      }
    }
  }, [latestWonAuctionId, effectiveWalletAddress, eligibilityFrameContext, explicitlyCheckedClaim, checkClaimStatusForLatestAuction, isWebContext, walletStatusDetermined]);
  
  // Reset eligibility check when hasClicked or hasClaimed or manualHasClaimedLatest changes
  useEffect(() => {
    
    if (!hasClaimed && manualHasClaimedLatest !== true) {
      setHasCheckedEligibility(false);
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest, redirectClickData?.hasVisited]);
  
  
  // NEW: Check if user is Twitter/Farcaster but needs wallet for claiming
  const isTwitterUserNeedsWallet = useMemo(() => {
    if (!isWebContext || !authenticated || !user?.linkedAccounts) return false;
    
    const hasTwitterOrFarcaster = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
    
    return hasTwitterOrFarcaster && !effectiveWalletAddress;
  }, [isWebContext, authenticated, user?.linkedAccounts, effectiveWalletAddress]);

  // NEW: LocalStorage flow state tracking
  const FLOW_STATE_KEY = 'qrcoin_claim_flow_state';
  
  const getFlowState = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(FLOW_STATE_KEY);
    }
    return null;
  }, []);
  
  const clearFlowState = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(FLOW_STATE_KEY);
    }
  }, []);

  // NEW: Check flow state on mount - handle manual sign-in flow
  // This handles the case where user clicked "Today's Winner", signed in with Twitter,
  // and needs to connect wallet before seeing claim popup
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If user was in claiming flow and now authenticated, show appropriate action
    if (flowState === 'claiming' && authenticated) {
      
      // Small delay to ensure wallet state is determined
      setTimeout(() => {
        if (isTwitterUserNeedsWallet && !hasTriggeredWalletConnection) {
          setHasTriggeredWalletConnection(true);
          connectWallet({
            onSuccess: () => {
              // Wallet connected successfully, the other useEffect will handle showing popup
              console.log('Wallet connected after Twitter sign-in');
            },
            onError: (error: Error) => {
              console.error('Failed to connect wallet after Twitter sign-in:', error);
              // Clear flow state on error
              clearFlowState();
              setHasTriggeredWalletConnection(false);
            }
          });
          // Don't clear flow state yet - wait for wallet to connect
        } else if (hasTriggeredWalletConnection && isTwitterUserNeedsWallet) {
        } else if (latestWonAuctionId && !manualHasClaimedLatest && !hasUserDismissedPopup) {
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
            hasShownPopupThisPageSession = true; // Set global flag
          }
          // Clear the flow state after handling
          clearFlowState();
        }
      }, 1000);
    }
  }, [authenticated, isTwitterUserNeedsWallet, latestWonAuctionId, manualHasClaimedLatest, isWebContext, getFlowState, clearFlowState, requestPopup, connectWallet, hasTriggeredWalletConnection, hasUserDismissedPopup]);

  // Reset wallet connection flag when not in claiming flow
  useEffect(() => {
    const flowState = getFlowState();
    if (!flowState || flowState !== 'claiming') {
      setHasTriggeredWalletConnection(false);
    }
  }, [getFlowState]);

  // NEW: Listen for wallet connection completion to show claim popup
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If user was in claiming flow, is authenticated, but previously needed wallet, and now has wallet
    if (flowState === 'claiming' && authenticated && !isTwitterUserNeedsWallet && effectiveWalletAddress) {
      
      // Small delay to ensure everything is ready
      setTimeout(() => {
        if (latestWonAuctionId && !manualHasClaimedLatest && !hasUserDismissedPopup) {
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
            hasShownPopupThisPageSession = true; // Set global flag
          } else {
          }
        } else {
        }
        // Clear the flow state after handling
        clearFlowState();
      }, 1000); // Increased delay to ensure wallet state is fully updated
    }
  }, [isWebContext, authenticated, isTwitterUserNeedsWallet, effectiveWalletAddress, latestWonAuctionId, manualHasClaimedLatest, getFlowState, clearFlowState, requestPopup, hasUserDismissedPopup]);

  // NEW: Additional fallback - listen for any wallet address changes when in claiming flow
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If we have flow state, user is authenticated, and wallet just became available
    if (flowState === 'claiming' && authenticated && effectiveWalletAddress && !showClaimPopup) {
      
      // Small delay and then check if we should show the popup
      setTimeout(() => {
        if (latestWonAuctionId && !manualHasClaimedLatest && !isPopupActive('linkVisit') && !hasUserDismissedPopup) {
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
            hasShownPopupThisPageSession = true; // Set global flag
          }
          clearFlowState();
        }
      }, 2000);
    }
  }, [effectiveWalletAddress, isWebContext, authenticated, showClaimPopup, latestWonAuctionId, manualHasClaimedLatest, getFlowState, clearFlowState, requestPopup, isPopupActive, hasUserDismissedPopup]);
  
  // Listen for trigger from other popups closing
  useEffect(() => {
    const handleTrigger = () => {
      
      // NEW: Skip trigger if there's an active claiming flow - let flow state logic handle it
      const flowState = getFlowState();
      if (flowState === 'claiming') {
        return;
      }
      
      // Don't show popup if user has already dismissed it
      if (hasUserDismissedPopup) {
        return;
      }
      
      // Don't show popup if wallet status hasn't been determined yet
      if (!walletStatusDetermined) {
        return;
      }
      
      // Don't show popup if database check hasn't been completed yet
      if (!explicitlyCheckedClaim) {
        return;
      }
      
      // Don't show popup if database check is still in progress
      if (isCheckingDatabase) {
        return;
      }
      
      // For web context, check eligibility based on authentication status
      if (isWebContext) {
        // Hide popup for traditional wallet users (coinbase, metamask, etc.)
        if (hasTraditionalWalletOnly) {
          return;
        }
        
        // Show popup for disconnected users or Twitter/Farcaster users
        const shouldShow = !authenticated || isTwitterOrFarcasterUser;
        
        if (shouldShow) {
          // Use combined claim status for authenticated users
          const combinedHasClaimed = authenticated ? (manualHasClaimedLatest === true || hasClaimed) : false;
          
          // Check if user is eligible (disconnected or hasn't claimed for latest won auction)
          if ((!authenticated || !combinedHasClaimed) && latestWonAuctionId && !isLoading) {
            const granted = requestPopup('linkVisit');
            if (granted) {
              setShowClaimPopup(true);
              hasShownPopupThisPageSession = true; // Set global flag
            }
          } else {
          }
        } else {
        }
      } else {
        // Mini-app logic - use combined claim status
        const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
        
        if (!combinedHasClaimed && latestWonAuctionId && !isLoading) {
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
            hasShownPopupThisPageSession = true; // Set global flag
          }
        } else {
        }
      }
      setHasCheckedEligibility(true);
    };
    
    window.addEventListener('triggerLinkVisitPopup', handleTrigger);
    return () => window.removeEventListener('triggerLinkVisitPopup', handleTrigger);
  }, [manualHasClaimedLatest, latestWonAuctionId, effectiveWalletAddress, isLoading, explicitlyCheckedClaim, requestPopup, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase, hasClaimed, hasTraditionalWalletOnly, isTwitterOrFarcasterUser, getFlowState, hasUserDismissedPopup]);
  
  // Show popup when user can interact with it (auto-show if eligible)
  useEffect(() => {
    // LinkVisit popup can now auto-show if user is eligible
    
    // NEW: Skip auto-show if there's an active claiming flow - let flow state logic handle it
    const flowState = getFlowState();
    if (flowState === 'claiming') {
      return;
    }
    
    // Check global flag to prevent showing popup multiple times in the same page session
    if (hasShownPopupThisPageSession) {
      return;
    }
    
    // Don't show popup if user has already dismissed it
    if (hasUserDismissedPopup) {
      return;
    }
    
    // Ensure we have explicitly checked claim status before showing popup
    if (!explicitlyCheckedClaim) {
      return;
    }
    
    // Wait for wallet status to be determined before showing popup
    if (!walletStatusDetermined) {
      return;
    }
    
    // Wait for database check to complete before showing popup
    if (isCheckingDatabase) {
      return;
    }
    
    // CRITICAL: Wait for redirect click data to load
    if (isRedirectClickLoading) {
      return;
    }
    
    // Only check once and when data is loaded
    if (hasCheckedEligibility || isLoading || isCheckingLatestAuction) {
      return;
    }
    
    // For web context, check eligibility based on authentication and wallet type
    if (isWebContext) {
      
      // Hide popup for traditional wallet users (coinbase, metamask, etc.)
      if (hasTraditionalWalletOnly) {
        setHasCheckedEligibility(true);
        return;
      }
      
      // Show popup for disconnected users or Twitter/Farcaster users
      const shouldShow = !authenticated || isTwitterOrFarcasterUser;
      
      if (shouldShow) {
        // Use combined claim status for authenticated users (disconnected users haven't claimed)
        const combinedHasClaimed = authenticated ? (manualHasClaimedLatest === true || hasClaimed) : false;
        
        // Show popup if they haven't claimed for the latest won auction or are disconnected
        if ((!authenticated || !combinedHasClaimed) && latestWonAuctionId) {
          
          const timer = setTimeout(() => {
            const granted = requestPopup('linkVisit');
            if (granted) {
              setShowClaimPopup(true);
              hasShownPopupThisPageSession = true; // Set global flag
            }
            setHasCheckedEligibility(true);
          }, 2500);
          
          return () => clearTimeout(timer);
        } else {
          if (authenticated && combinedHasClaimed) {
          } else if (!latestWonAuctionId) {
          }
          setHasCheckedEligibility(true);
        }
      } else {
        setHasCheckedEligibility(true);
      }
    } else {
      // Mini-app logic (existing)
      
      // Use combined claim status (same as context value)
      const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
      
      // Only show popup if the user hasn't claimed for the latest won auction
      if (!combinedHasClaimed && latestWonAuctionId) {
        
        const timer = setTimeout(() => {
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
            hasShownPopupThisPageSession = true; // Set global flag
          }
          setHasCheckedEligibility(true);
        }, 1000);
        
        return () => clearTimeout(timer);
      } else {
        if (combinedHasClaimed) {
        } else if (!latestWonAuctionId) {
        }
        setHasCheckedEligibility(true);
      }
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, hasCheckedEligibility, effectiveWalletAddress, auctionId, latestWonAuctionId, isCheckingLatestAuction, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase, hasTraditionalWalletOnly, isTwitterOrFarcasterUser, getFlowState, requestPopup, redirectClickData?.hasVisited, isRedirectClickLoading, hasUserDismissedPopup]);
  
  // NEW: Track when Privy modal is active to prevent popup interference
  const [isPrivyModalActive, setIsPrivyModalActive] = useState(false);
  
  // Monitor Privy connection state to detect when modal is active
  useEffect(() => {
    if (hasTriggeredWalletConnection && isTwitterUserNeedsWallet && !effectiveWalletAddress) {
      setIsPrivyModalActive(true);
    } else if (authenticated && effectiveWalletAddress) {
      // Immediately clear when wallet connection completes
      setIsPrivyModalActive(false);
    } else if (!isTwitterUserNeedsWallet) {
      // Clear if user no longer needs wallet
      setIsPrivyModalActive(false);
    }
  }, [hasTriggeredWalletConnection, isTwitterUserNeedsWallet, authenticated, effectiveWalletAddress]);
  
  // Cleanup Privy modal state when popup closes
  useEffect(() => {
    if (!showClaimPopup) {
      setIsPrivyModalActive(false);
    }
  }, [showClaimPopup]);

  // Handle claim action
  const handleClaim = async (captchaToken: string) => {
    
    // For web context, wallet should already be connected via authentication check
    // For mini-app context, wallet should already be connected as before
    const result = await claimTokens(captchaToken || undefined);
    
    // Update our manual tracking state after claim
    if (result.txHash) {
      setManualHasClaimedLatest(true);
      // Reset dismissal flag on successful claim so user can see popup for next auction
      setHasUserDismissedPopup(false);
    }
    
    return result;
  };
  
  // Close popup
  const handleClose = () => {
    setShowClaimPopup(false);
    releasePopup('linkVisit');
    clearFlowState();
    // Mark that user has dismissed the popup
    setHasUserDismissedPopup(true);
  };

  return (
    <LinkVisitContext.Provider
      value={{
        showClaimPopup,
        setShowClaimPopup,
        hasClicked: hasClicked || redirectClickData?.hasVisited || hasVisitedRedirect,
        hasClaimed: manualHasClaimedLatest === true || hasClaimed, // Use combined claim status
        isLoading,
        auctionId,
        winningUrl,
        winningImage,
        isLatestWonAuction,
        latestWonAuctionId,
        isWebContext,
        needsWalletConnection,
        walletStatusDetermined,
        authCheckComplete,
        isCheckingDatabase,
        isTwitterUserNeedsWallet,
        isPrivyModalActive
      }}
    >
      {children}
      
      
      {/* Only render popup when we have the latest won auction ID and redirect data is loaded */}
      {!POPUP_DISABLED && (
        <LinkVisitClaimPopup
          isOpen={showClaimPopup}
          onClose={handleClose}
          hasClicked={hasClicked || redirectClickData?.hasVisited || hasVisitedRedirect}
          winningUrl={latestWinningUrl || winningUrl}
          winningImage={latestWinningImage || winningImage}
          auctionId={latestWonAuctionId || 0}
          onClaim={handleClaim}
          isPrivyModalActive={isPrivyModalActive}
          isTwitterUserNeedsWallet={isTwitterUserNeedsWallet}
          expectedClaimAmount={expectedClaimAmount}
          isCheckingAmount={isCheckingAmount}
        />
      )}
    </LinkVisitContext.Provider>
  );
} 