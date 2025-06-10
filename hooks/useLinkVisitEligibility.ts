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
  
  // Get Twitter username for web context
  const getTwitterUsername = useCallback(() => {
    if (!isWebContext || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    
    const twitterAccount = user.linkedAccounts.find((account: { type: string; username?: string }) => 
      account.type === 'twitter_oauth'
    );
    
    return twitterAccount?.username || null;
  }, [isWebContext, authenticated, user?.linkedAccounts]);
  
  // Log state changes
  useEffect(() => {
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
      
      // If no auction ID, can't check status
      if (!auctionId) {
        setIsLoading(false);
        return;
      }

      if (isWebContext) {
        // Web context: check by wallet address or Twitter username with cross-context support
        const twitterUsername = getTwitterUsername();
        
        if (!effectiveWalletAddress && !twitterUsername) {
          setIsLoading(false);
          return;
        }
        
        setIsLoading(true);
        
        try {
          
          // Get both Twitter and Farcaster usernames
          let farcasterUsername: string | null = null;
          
          // twitterUsername already retrieved above in the scope
          
          // Get Farcaster username associated with this address if we have one
          if (effectiveWalletAddress) {
            try {
              const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
              farcasterUsername = farcasterUser?.username || null;
            } catch (error) {
              console.warn('HOOK: Could not fetch Farcaster username for address:', error);
            }
          }
          
          // For web users, we need to get their Privy userId for more secure checking
          let privyUserId: string | null = null;
          if (authenticated && user?.id) {
            privyUserId = user.id; // This is the Privy DID
          }
          
          // Check for ANY claims by this wallet address (regardless of claim_source)
          let allClaims: Array<{
            id: string;
            eth_address?: string;
            username?: string;
            user_id?: string;
            claimed_at?: string;
            link_visited_at?: string;
            auction_id: number;
          }> = [];
          if (effectiveWalletAddress) {
            const { data: addressClaims, error } = await supabase
              .from('link_visit_claims')
              .select('*')
              .eq('eth_address', effectiveWalletAddress)
              .eq('auction_id', auctionId);
            
            if (!error && addressClaims) {
              allClaims = addressClaims;
            }
          }
          
          // Also check for claims by user identifier (userId for web, username for Farcaster)
          let userClaims: typeof allClaims = [];
          
          // For web users, check by Privy userId (more secure)
          if (privyUserId) {
            const { data: userIdClaimsData, error: userIdError } = await supabase
              .from('link_visit_claims')
              .select('*')
              .eq('user_id', privyUserId)
              .eq('auction_id', auctionId);
            
            if (!userIdError && userIdClaimsData) {
              userClaims = [...userClaims, ...userIdClaimsData];
            }
          }
          
          // Also check by usernames (for cross-context compatibility and Farcaster users)
          const usernamesToCheck = [twitterUsername, farcasterUsername].filter(Boolean);
          if (usernamesToCheck.length > 0) {
            for (const username of usernamesToCheck) {
              const { data: usernameClaimsData, error: usernameError } = await supabase
                .from('link_visit_claims')
                .select('*')
                .ilike('username', username!)
                .eq('auction_id', auctionId);
              
              if (!usernameError && usernameClaimsData) {
                userClaims = [...userClaims, ...usernameClaimsData];
              }
            }
          }
          
          // Combine both sets of claims and deduplicate by id
          const allClaimsArray = [...(allClaims || []), ...userClaims];
          const combinedClaims = allClaimsArray.filter((claim, index, self) => 
            index === self.findIndex(c => c.id === claim.id)
          );
          
          if (combinedClaims.length > 0) {
            // Find the most relevant claim (prefer the one that matches the current context)
            const relevantClaim = combinedClaims.find(claim => claim.eth_address === effectiveWalletAddress) || combinedClaims[0];
            
            
            setHasClicked(!!relevantClaim.link_visited_at);
            setHasClaimed(!!relevantClaim.claimed_at);
          } else {
            // No record found, reset states
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
          setIsLoading(false);
          return;
        }

        const fid = frameContext.user?.fid;
        
      
        if (!fid) {
          setIsLoading(false);
          return;
        }
        
        setIsLoading(true);
        
        try {
          // Check if user has already claimed or clicked
          const { data, error } = await supabase
            .from('link_visit_claims')
            .select('*')
            .eq('fid', fid)
            .eq('auction_id', auctionId)
            .eq('claim_source', 'mini_app')
            .maybeSingle();
        
          if (error && error.code !== 'PGRST116') {
          }
          
          if (data) {
            setHasClicked(!!data.link_visited_at);
            setHasClaimed(!!data.claimed_at);
          } else {
            // No record found, reset states
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
  }, [frameContext, auctionId, isWebContext, effectiveWalletAddress, authenticated, user, getTwitterUsername]);
  
  // Record claim in database
  const recordClaim = async (txHash?: string): Promise<boolean> => {
    if (isWebContext) {
      // Web context: use wallet address (required for claiming)
      if (!effectiveWalletAddress || !auctionId) return false;
      
      try {

        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        // Get Twitter username and Privy userId for web context
        const twitterUsername = getTwitterUsername();
        const privyUserId = authenticated && user?.id ? user.id : null;
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid, // Placeholder for web users
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 420, // 420 QR tokens
            tx_hash: txHash,
            success: !!txHash,
            claim_source: 'web',
            username: twitterUsername || null, // Display username from Twitter
            user_id: privyUserId // Verified Privy userId
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
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: frameContext.user.fid,
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 420, // 420 QR tokens
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
        
        // Update local state immediately for UI responsiveness
        setHasClicked(true);

        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        // Get Twitter username and Privy userId for web context
        const twitterUsername = getTwitterUsername();
        const privyUserId = authenticated && user?.id ? user.id : null;
        
        // Record in database
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid, // Placeholder for web users
            auction_id: auctionId,
            link_visited_at: new Date().toISOString(),
            eth_address: effectiveWalletAddress,
            claim_source: 'web',
            username: twitterUsername || null, // Display username from Twitter
            user_id: privyUserId // Verified Privy userId
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
      // Web context: refresh by wallet address or Twitter username with cross-context support
      const twitterUsername = getTwitterUsername();
      
      if ((effectiveWalletAddress || twitterUsername) && auctionId) {
        setIsLoading(true);
        
        try {
          // Get both Twitter and Farcaster usernames
          let farcasterUsername: string | null = null;
          
          // twitterUsername already retrieved above
          
          // Get Farcaster username associated with this address if we have one
          if (effectiveWalletAddress) {
            try {
              const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
              farcasterUsername = farcasterUser?.username || null;
            } catch (error) {
              console.warn('HOOK: Could not fetch Farcaster username for address:', error);
            }
          }
          
          // For web users, we need to get their Privy userId for more secure checking
          let privyUserId: string | null = null;
          if (authenticated && user?.id) {
            privyUserId = user.id; // This is the Privy DID
          }
          
          // Check for ANY claims by this wallet address (regardless of claim_source)
          let allClaims: Array<{
            id: string;
            eth_address?: string;
            username?: string;
            user_id?: string;
            claimed_at?: string;
            link_visited_at?: string;
            auction_id: number;
          }> = [];
          if (effectiveWalletAddress) {
            const { data: addressClaims, error } = await supabase
              .from('link_visit_claims')
              .select('*')
              .eq('eth_address', effectiveWalletAddress)
              .eq('auction_id', auctionId);
            
            if (!error && addressClaims) {
              allClaims = addressClaims;
            }
          }
          
          // Also check for claims by user identifier (userId for web, username for Farcaster)
          let userClaims: typeof allClaims = [];
          
          // For web users, check by Privy userId (more secure)
          if (privyUserId) {
            const { data: userIdClaimsData, error: userIdError } = await supabase
              .from('link_visit_claims')
              .select('*')
              .eq('user_id', privyUserId)
              .eq('auction_id', auctionId);
            
            if (!userIdError && userIdClaimsData) {
              userClaims = [...userClaims, ...userIdClaimsData];
            }
          }
          
          // Also check by usernames (for cross-context compatibility and Farcaster users)
          const usernamesToCheck = [twitterUsername, farcasterUsername].filter(Boolean);
          if (usernamesToCheck.length > 0) {
            for (const username of usernamesToCheck) {
              const { data: usernameClaimsData, error: usernameError } = await supabase
                .from('link_visit_claims')
                .select('*')
                .ilike('username', username!)
                .eq('auction_id', auctionId);
              
              if (!usernameError && usernameClaimsData) {
                userClaims = [...userClaims, ...usernameClaimsData];
              }
            }
          }
          
          // Combine both sets of claims and deduplicate by id
          const allClaimsArray = [...(allClaims || []), ...userClaims];
          const combinedClaims = allClaimsArray.filter((claim, index, self) => 
            index === self.findIndex(c => c.id === claim.id)
          );
          
          if (combinedClaims.length > 0) {
            const relevantClaim = combinedClaims.find(claim => claim.eth_address === effectiveWalletAddress) || combinedClaims[0];
            setHasClicked(!!relevantClaim.link_visited_at);
            setHasClaimed(!!relevantClaim.claimed_at);
          } else {
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
          }
          
          if (data) {
            setHasClicked(!!data.link_visited_at);
            setHasClaimed(!!data.claimed_at);
          } else {
            setHasClicked(false);
            setHasClaimed(false);
          }
        } catch (error) {
          console.error('Manual mini-app refresh error:', error);
          setIsLoading(false);
        }
      }
    }
  }, [checkFrameContext, auctionId, isWebContext, effectiveWalletAddress, getTwitterUsername]);
  
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