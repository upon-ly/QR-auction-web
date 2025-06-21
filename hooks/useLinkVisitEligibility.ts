import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import type { Context } from '@farcaster/frame-sdk';
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { getFarcasterUser } from '@/utils/farcaster';
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Define the shape of our link visit claim data
interface LinkVisitClaim {
  id: string;
  eth_address?: string;
  username?: string;
  user_id?: string;
  claimed_at?: string;
  link_visited_at?: string;
  auction_id: number;
  fid?: number;
  claim_source?: string;
}

// Key factory for React Query
const linkVisitKeys = {
  all: ['linkVisit'] as const,
  byAuction: (auctionId: number) => [...linkVisitKeys.all, 'auction', auctionId] as const,
  byUser: (auctionId: number, identifier: string) => [...linkVisitKeys.byAuction(auctionId), identifier] as const,
};

export function useLinkVisitEligibility(auctionId: number, isWebContext: boolean = false) {
  const queryClient = useQueryClient();
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const frameCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Web-specific hooks
  const { authenticated, user } = usePrivy();
  const { address } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  
  // Get smart wallet address from user's linked accounts
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => account.type === 'smart_wallet')?.address;
  
  // Use appropriate wallet address based on context
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
  
  // Initialize frame context (only for mini-app)
  const initializeFrameContext = useCallback(async () => {
    if (isWebContext) return;
    
    try {
      // Use SDK singleton with built-in caching
      const context = await frameSdk.getContext();
      setFrameContext(context);
      
      if (!walletAddress) {
        const isWalletConnected = await frameSdk.isWalletConnected();
        if (isWalletConnected) {
          const accounts = await frameSdk.connectWallet();
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error initializing frame context:', error);
    }
  }, [isWebContext, walletAddress]);
  
  // Set up frame context polling with reduced frequency
  useEffect(() => {
    if (!isWebContext) {
      initializeFrameContext();
      
      // Only poll every 30 seconds instead of 3 seconds
      frameCheckIntervalRef.current = setInterval(() => {
        initializeFrameContext();
      }, 30000);
      
      return () => {
        if (frameCheckIntervalRef.current) {
          clearInterval(frameCheckIntervalRef.current);
        }
      };
    }
  }, [isWebContext, initializeFrameContext]);
  
  // Build query key based on context
  const queryKey = isWebContext
    ? linkVisitKeys.byUser(auctionId, effectiveWalletAddress || getTwitterUsername() || 'unknown')
    : linkVisitKeys.byUser(auctionId, frameContext?.user?.fid?.toString() || 'unknown');
  
  // Query function to check link visit status
  const checkVisitStatus = async (): Promise<{ hasClicked: boolean; hasClaimed: boolean }> => {
    if (!auctionId) {
      return { hasClicked: false, hasClaimed: false };
    }

    if (isWebContext) {
      // Web context logic
      const twitterUsername = getTwitterUsername();
      
      if (!effectiveWalletAddress && !twitterUsername) {
        return { hasClicked: false, hasClaimed: false };
      }
      
      let farcasterUsername: string | null = null;
      let privyUserId: string | null = null;
      
      if (effectiveWalletAddress) {
        try {
          const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
          farcasterUsername = farcasterUser?.username || null;
        } catch (error) {
          console.warn('Could not fetch Farcaster username:', error);
        }
      }
      
      if (authenticated && user?.id) {
        privyUserId = user.id;
      }
      
      // Check for claims by wallet address
      let allClaims: LinkVisitClaim[] = [];
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
      
      // Check by userId
      if (privyUserId) {
        const { data: userIdClaimsData, error: userIdError } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('user_id', privyUserId)
          .eq('auction_id', auctionId);
        
        if (!userIdError && userIdClaimsData) {
          allClaims = [...allClaims, ...userIdClaimsData];
        }
      }
      
      // Check by usernames
      const usernamesToCheck = [twitterUsername, farcasterUsername].filter(Boolean);
      for (const username of usernamesToCheck) {
        const { data: usernameClaimsData, error: usernameError } = await supabase
          .from('link_visit_claims')
          .select('*')
          .ilike('username', username!)
          .eq('auction_id', auctionId);
        
        if (!usernameError && usernameClaimsData) {
          allClaims = [...allClaims, ...usernameClaimsData];
        }
      }
      
      // Deduplicate claims
      const uniqueClaims = allClaims.filter((claim, index, self) => 
        index === self.findIndex(c => c.id === claim.id)
      );
      
      if (uniqueClaims.length > 0) {
        const relevantClaim = uniqueClaims.find(claim => claim.eth_address === effectiveWalletAddress) || uniqueClaims[0];
        return {
          hasClicked: !!relevantClaim.link_visited_at,
          hasClaimed: !!relevantClaim.claimed_at
        };
      }
      
      return { hasClicked: false, hasClaimed: false };
    } else {
      // Mini-app context
      if (!frameContext?.user?.fid) {
        return { hasClicked: false, hasClaimed: false };
      }
      
      const { data, error } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('fid', frameContext.user.fid)
        .eq('auction_id', auctionId)
        .eq('claim_source', 'mini_app')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error checking status:', error);
      }
      
      if (data) {
        return {
          hasClicked: !!data.link_visited_at,
          hasClaimed: !!data.claimed_at
        };
      }
      
      return { hasClicked: false, hasClaimed: false };
    }
  };
  
  // Use React Query for the status check
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: checkVisitStatus,
    // Only enable query when we have the necessary data
    enabled: isWebContext 
      ? !!(effectiveWalletAddress || getTwitterUsername()) && !!auctionId
      : !!frameContext?.user?.fid && !!auctionId,
    // Stale time of 30 seconds - data is fresh for 30 seconds
    staleTime: 30 * 1000,
    // Cache time of 5 minutes
    gcTime: 5 * 60 * 1000,
  });
  
  // Mutation for recording clicks
  const recordClickMutation = useMutation({
    mutationFn: async () => {
      if (isWebContext) {
        if (!effectiveWalletAddress || !auctionId) throw new Error('Missing required data');
        
        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase();
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        const twitterUsername = getTwitterUsername();
        const privyUserId = authenticated && user?.id ? user.id : null;
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid,
            auction_id: auctionId,
            link_visited_at: new Date().toISOString(),
            eth_address: effectiveWalletAddress,
            claim_source: 'web',
            username: twitterUsername || null,
            user_id: privyUserId
          }, {
            onConflict: 'eth_address,auction_id'
          });
        
        if (error) throw error;
      } else {
        if (!frameContext?.user?.fid || !auctionId) throw new Error('Missing required data');
        
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
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Invalidate and refetch the query
      queryClient.invalidateQueries({ queryKey });
    },
  });
  
  // Mutation for recording claims
  const recordClaimMutation = useMutation({
    mutationFn: async (txHash?: string) => {
      if (isWebContext) {
        if (!effectiveWalletAddress || !auctionId) throw new Error('Missing required data');
        
        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase();
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        const twitterUsername = getTwitterUsername();
        const privyUserId = authenticated && user?.id ? user.id : null;
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: effectiveFid,
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 420,
            tx_hash: txHash,
            success: !!txHash,
            claim_source: 'web',
            username: twitterUsername || null,
            user_id: privyUserId
          }, {
            onConflict: 'eth_address,auction_id'
          });
        
        if (error) throw error;
      } else {
        if (!frameContext?.user?.fid || !effectiveWalletAddress || !auctionId) throw new Error('Missing required data');
        
        const { error } = await supabase
          .from('link_visit_claims')
          .upsert({
            fid: frameContext.user.fid,
            auction_id: auctionId,
            eth_address: effectiveWalletAddress,
            claimed_at: new Date().toISOString(),
            amount: 420,
            tx_hash: txHash,
            success: !!txHash,
            claim_source: 'mini_app',
            username: frameContext.user.username || null
          }, {
            onConflict: 'fid,auction_id'
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Invalidate and refetch the query
      queryClient.invalidateQueries({ queryKey });
    },
  });
  
  return {
    hasClicked: data?.hasClicked || false,
    hasClaimed: data?.hasClaimed || false,
    isLoading,
    recordClaim: (txHash?: string) => recordClaimMutation.mutateAsync(txHash).then(() => true).catch(() => false),
    recordClick: () => recordClickMutation.mutateAsync().then(() => true).catch(() => false),
    frameContext,
    walletAddress: effectiveWalletAddress,
    checkFrameContext: initializeFrameContext,
    refreshStatus: refetch
  };
}