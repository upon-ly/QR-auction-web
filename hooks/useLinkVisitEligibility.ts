import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { getFarcasterUser } from '@/utils/farcaster';
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function useLinkVisitEligibility(auctionId: number, isWebContext: boolean = false) {
  const [hasClicked, setHasClicked] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Web-specific hooks
  const { authenticated, user } = usePrivy();
  const { address } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  
  // Get smart wallet address from user's linked accounts (more reliable)
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => account.type === 'smart_wallet')?.address;
  
  // Use appropriate wallet address based on context - prioritize smart wallet for web users
  const effectiveWalletAddress = isWebContext 
    ? (smartWalletAddress || smartWalletClient?.account?.address || address)
    : walletAddress;
  
  // Log state changes
  useEffect(() => {
    console.log("LINK VISIT ELIGIBILITY - State changed:");
    console.log("auctionId:", auctionId);
    console.log("isWebContext:", isWebContext);
    console.log("hasClicked:", hasClicked);
    console.log("hasClaimed:", hasClaimed);
    console.log("isLoading:", isLoading);
    console.log("effectiveWalletAddress:", effectiveWalletAddress);
    console.log("frameContext username:", frameContext?.user?.username);
    console.log("frameContext fid:", frameContext?.user?.fid);
    console.log("authenticated (web):", authenticated);
  }, [hasClicked, hasClaimed, isLoading, effectiveWalletAddress, frameContext, auctionId, isWebContext, authenticated]);
  
  // Function to refresh frame context (can be called repeatedly to check for changes)
  const checkFrameContext = useCallback(async () => {
    if (isWebContext) {
      // For web context, we don't need frame context
      return null;
    }
    
    try {
      // Request latest frame context
      const context = await frameSdk.getContext();
      console.log("Frame context updated:", context);
      
      // Update context state
      setFrameContext(context);
      
      // If we don't have a wallet address yet, try to get it
      if (!walletAddress) {
        const isWalletConnected = await frameSdk.isWalletConnected();
        if (isWalletConnected) {
          const accounts = await frameSdk.connectWallet();
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        }
      }
      
      // Return the context for convenience
      return context;
    } catch (error) {
      console.error('Error fetching frame context:', error);
      return null;
    }
  }, [walletAddress, isWebContext]);
  
  // Get initial frame context and wallet, and poll for updates (only for mini-app)
  useEffect(() => {
    if (isWebContext) {
      // For web context, we're done with initialization
      return;
    }
    
    const initializeFrameContext = async () => {
      await checkFrameContext();
    };
    
    initializeFrameContext();
    
    // Set up an interval to check for updates
    const intervalId = setInterval(() => {
      checkFrameContext();
    }, 3000); // Check every 3 seconds
    
    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [checkFrameContext, isWebContext]);

  // Check link visit status based on context
  useEffect(() => {
    const checkVisitStatus = async () => {
      console.log("CHECKING LINK VISIT STATUS - Starting check");
      
      // If no auction ID, can't check status
      if (!auctionId) {
        console.log("Missing auction ID");
        setIsLoading(false);
        return;
      }

      if (isWebContext) {
        // Web context: check by wallet address with cross-context support
        if (!effectiveWalletAddress) {
          console.log("No wallet address found for web context");
          setIsLoading(false);
          return;
        }
        
        setIsLoading(true);
        
        try {
          console.log("🔍 HOOK: Checking database for web link visit status with cross-context support");
          
          // Get Farcaster username associated with this address
          let farcasterUsername: string | null = null;
          try {
            console.log('🔍 HOOK: Getting Farcaster username for address:', effectiveWalletAddress);
            const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
            farcasterUsername = farcasterUser?.username || null;
            console.log('🔍 HOOK: Associated Farcaster username:', farcasterUsername);
          } catch (error) {
            console.warn('HOOK: Could not fetch Farcaster username for address:', error);
          }
          
          // Check for ANY claims by this wallet address for this auction (regardless of claim_source)
          const { data: allClaims, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('eth_address', effectiveWalletAddress)
            .eq('auction_id', auctionId);
          
          // Also check for claims by the Farcaster username if we found one
          let usernameClaims: typeof allClaims = [];
          if (farcasterUsername) {
            console.log('🔍 HOOK: Checking for username claims:', farcasterUsername);
            const { data: usernameClaimsData, error: usernameError } = await supabase
              .from('link_visit_claims')
              .select('*')
              .ilike('username', farcasterUsername)
              .eq('auction_id', auctionId);
            
            if (!usernameError && usernameClaimsData) {
              usernameClaims = usernameClaimsData;
              console.log('🔍 HOOK: Username claims found:', usernameClaims.length);
            }
          }
          
          // Combine both sets of claims and deduplicate by id
          const allClaimsArray = [...(allClaims || []), ...usernameClaims];
          const combinedClaims = allClaimsArray.filter((claim, index, self) => 
            index === self.findIndex(c => c.id === claim.id)
          );
        
          if (error && error.code !== 'PGRST116') {
            console.error('Error checking web link visit status:', error);
          }
          
          if (combinedClaims.length > 0) {
            // Find the most relevant claim (prefer the one that matches the current context)
            const relevantClaim = combinedClaims.find(claim => claim.eth_address === effectiveWalletAddress) || combinedClaims[0];
            
            console.log("🔍 HOOK: Cross-context visit status found:", {
              hasClicked: !!relevantClaim.link_visited_at,
              hasClaimed: !!relevantClaim.claimed_at,
              totalClaims: combinedClaims.length,
              farcasterUsername,
              record: relevantClaim
            });
            
            setHasClicked(!!relevantClaim.link_visited_at);
            setHasClaimed(!!relevantClaim.claimed_at);
          } else {
            // No record found, reset states
            console.log("🔍 HOOK: No cross-context visit records found");
            setHasClicked(false);
            setHasClaimed(false);
          }
          
          setIsLoading(false);
        } catch (error) {
          console.error('Error checking web link visit status:', error);
          setIsLoading(false);
        }
      } else {
        // Mini-app context: check by FID (existing logic)
        if (!frameContext) {
          console.log("Missing frame context");
          setIsLoading(false);
          return;
        }

        const fid = frameContext.user?.fid;
        const username = frameContext.user?.username;
        
        console.log("VISIT STATUS CHECK:", { fid, username, auctionId });
      
        if (!fid) {
          console.log("No FID found");
          setIsLoading(false);
          return;
        }
        
        setIsLoading(true);
        
        try {
          // Check if user has already claimed or clicked
          console.log("Checking database for mini-app link visit status");
          const { data, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('fid', fid)
            .eq('auction_id', auctionId)
            .eq('claim_source', 'mini_app')
            .maybeSingle();
        
          if (error && error.code !== 'PGRST116') {
            console.error('Error checking mini-app link visit status:', error);
          }
          
          if (data) {
            console.log("Mini-app visit status found:", {
              hasClicked: !!data.link_visited_at,
              hasClaimed: !!data.claimed_at,
              record: data
            });
            setHasClicked(!!data.link_visited_at);
            setHasClaimed(!!data.claimed_at);
          } else {
            // No record found, reset states
            console.log("No mini-app visit records found");
            setHasClicked(false);
            setHasClaimed(false);
          }
        
          setIsLoading(false);
        } catch (error) {
          console.error('Error checking mini-app link visit status:', error);
          setIsLoading(false);
        }
      }
    };

    checkVisitStatus();
  }, [frameContext, auctionId, isWebContext, effectiveWalletAddress]);
  
  // Record claim in database
  const recordClaim = async (txHash?: string): Promise<boolean> => {
    if (isWebContext) {
      // Web context: use wallet address
      if (!effectiveWalletAddress || !auctionId) return false;
      
      try {
        console.log("Recording web claim in database:", {
          eth_address: effectiveWalletAddress,
          auction_id: auctionId,
          txHash
        });

        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid, // Placeholder for web users
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 1000, // 1,000 QR tokens
            tx_hash: txHash,
            success: !!txHash,
            claim_source: 'web',
            username: 'qrcoinweb'
          }, {
            onConflict: 'eth_address,auction_id'
          });
          
        if (error) {
          console.error("Error recording web claim:", error);
          throw error;
        }
        
        // Update local state
        setHasClaimed(true);
        return true;
      } catch (error) {
        console.error('Error recording web claim:', error);
        return false;
      }
    } else {
      // Mini-app context: use FID (existing logic)
      if (!frameContext?.user?.fid || !effectiveWalletAddress || !auctionId) return false;
      
      try {
        console.log("Recording mini-app claim in database:", {
          fid: frameContext.user.fid,
          auction_id: auctionId,
          txHash
        });
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: frameContext.user.fid,
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 1000, // 1,000 QR tokens
            tx_hash: txHash,
            success: !!txHash,
            claim_source: 'mini_app',
            username: frameContext.user.username || null
          }, {
            onConflict: 'fid,auction_id'
          });
          
        if (error) {
          console.error("Error recording mini-app claim:", error);
          throw error;
        }
        
        // Update local state
        setHasClaimed(true);
        return true;
      } catch (error) {
        console.error('Error recording mini-app claim:', error);
        return false;
      }
    }
  };

  // Record link click in database
  const recordClick = async (): Promise<boolean> => {
    if (isWebContext) {
      // Web context: use wallet address
      if (!effectiveWalletAddress || !auctionId) return false;
      
      try {
        console.log("Recording web link click:", {
          eth_address: effectiveWalletAddress,
          auction_id: auctionId
        });
        
        // Update local state immediately for UI responsiveness
        setHasClicked(true);

        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        // Record in database
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid, // Placeholder for web users
            auction_id: auctionId,
            link_visited_at: new Date().toISOString(),
            eth_address: effectiveWalletAddress,
            claim_source: 'web',
            username: 'qrcoinweb'
          }, {
            onConflict: 'eth_address,auction_id'
          });
          
        if (error) {
          console.error("Error recording web link click:", error);
          throw error;
        }
        
        return true;
      } catch (error) {
        console.error('Error recording web click:', error);
        return false;
      }
    } else {
      // Mini-app context: use FID (existing logic)
      if (!frameContext?.user?.fid || !auctionId) return false;
      
      try {
        console.log("Recording mini-app link click:", {
          fid: frameContext.user.fid,
          auction_id: auctionId
        });
        
        // Update local state immediately for UI responsiveness
        setHasClicked(true);
        
        // Record in database
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: frameContext.user.fid,
            auction_id: auctionId,
            link_visited_at: new Date().toISOString(),
            eth_address: effectiveWalletAddress || null,
            claim_source: 'mini_app',
            username: frameContext.user.username || null
          }, {
            onConflict: 'fid,auction_id'
          });
          
        if (error) {
          console.error("Error recording mini-app link click:", error);
          throw error;
        }
        
        return true;
      } catch (error) {
        console.error('Error recording mini-app click:', error);
        return false;
      }
    }
  };
  
  // Manual refresh function
  const refreshStatus = useCallback(async () => {
    if (isWebContext) {
      // Web context: refresh by wallet address with cross-context support
      if (effectiveWalletAddress && auctionId) {
        console.log("Manual refresh for web auction with cross-context check", auctionId);
        setIsLoading(true);
        
        try {
          // Get Farcaster username associated with this address
          let farcasterUsername: string | null = null;
          try {
            const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
            farcasterUsername = farcasterUser?.username || null;
          } catch (error) {
            console.warn('Manual refresh: Could not fetch Farcaster username for address:', error);
          }
          
          // Check for ANY claims by this wallet address (regardless of claim_source)
          const { data: allClaims, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('eth_address', effectiveWalletAddress)
            .eq('auction_id', auctionId);
          
          // Also check for claims by the Farcaster username if we found one
          let usernameClaims: typeof allClaims = [];
          if (farcasterUsername) {
            const { data: usernameClaimsData, error: usernameError } = await supabase
              .from('link_visit_claims')
              .select('*')
              .ilike('username', farcasterUsername)
              .eq('auction_id', auctionId);
            
            if (!usernameError && usernameClaimsData) {
              usernameClaims = usernameClaimsData;
            }
          }
          
          // Combine both sets of claims and deduplicate by id
          const allClaimsArray = [...(allClaims || []), ...usernameClaims];
          const combinedClaims = allClaimsArray.filter((claim, index, self) => 
            index === self.findIndex(c => c.id === claim.id)
          );
          
          if (error && error.code !== 'PGRST116') {
            console.error('Manual web refresh error:', error);
          }
          
          if (combinedClaims.length > 0) {
            const relevantClaim = combinedClaims.find(claim => claim.eth_address === effectiveWalletAddress) || combinedClaims[0];
            console.log("Manual web refresh found cross-context record:", relevantClaim);
            setHasClicked(!!relevantClaim.link_visited_at);
            setHasClaimed(!!relevantClaim.claimed_at);
          } else {
            console.log("Manual web refresh found no cross-context record");
            setHasClicked(false);
            setHasClaimed(false);
          }
        } catch (error) {
          console.error('Manual web refresh error:', error);
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      // Mini-app context: refresh by frame context (existing logic)
      const context = await checkFrameContext();
      
      if (context?.user?.fid && auctionId) {
        console.log("Manual refresh for mini-app auction", auctionId);
        setIsLoading(true);
        
        try {
          const { data, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('fid', context.user.fid)
            .eq('auction_id', auctionId)
            .eq('claim_source', 'mini_app')
            .maybeSingle();
          
          if (error && error.code !== 'PGRST116') {
            console.error('Manual mini-app refresh error:', error);
          }
          
          if (data) {
            console.log("Manual mini-app refresh found record:", data);
            setHasClicked(!!data.link_visited_at);
            setHasClaimed(!!data.claimed_at);
          } else {
            console.log("Manual mini-app refresh found no record");
            setHasClicked(false);
            setHasClaimed(false);
          }
        } catch (error) {
          console.error('Manual mini-app refresh error:', error);
          setIsLoading(false);
        }
      }
    }
  }, [checkFrameContext, auctionId, isWebContext, effectiveWalletAddress]);
  
  return { 
    hasClicked, 
    hasClaimed,
    isLoading,
    recordClaim,
    recordClick,
    frameContext,
    walletAddress: effectiveWalletAddress,
    checkFrameContext,
    refreshStatus
  };
} 