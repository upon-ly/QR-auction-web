import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import type { Context } from '@farcaster/frame-sdk';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Key factory for React Query
const airdropKeys = {
  all: ['airdrop'] as const,
  byFid: (fid: number) => [...airdropKeys.all, 'fid', fid] as const,
};

export function useAirdropEligibility() {
  const queryClient = useQueryClient();
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const frameCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize frame context
  const initializeFrameContext = useCallback(async () => {
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
      
      return context;
    } catch (error) {
      console.error('Error initializing frame context:', error);
      return null;
    }
  }, [walletAddress]);
  
  // Set up frame context polling with reduced frequency
  useEffect(() => {
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
  }, [initializeFrameContext]);
  
  // Query function to check eligibility
  const checkEligibility = async (): Promise<{ 
    isEligible: boolean; 
    hasClaimed: boolean; 
    hasAddedFrame: boolean; 
    hasNotifications: boolean 
  }> => {
    if (!frameContext || !walletAddress) {
      return { 
        isEligible: false, 
        hasClaimed: false, 
        hasAddedFrame: false, 
        hasNotifications: false 
      };
    }

    const fid = frameContext.user?.fid;
    const isFrameAdded = frameContext.client?.added || false;
    const hasNotifications = !!frameContext.client?.notificationDetails;
    
    if (!fid) {
      return { 
        isEligible: false, 
        hasClaimed: false, 
        hasAddedFrame: isFrameAdded, 
        hasNotifications 
      };
    }
    
    try {
      // Check if user has already claimed
      const { data: claimData } = await supabase
        .from('airdrop_claims')
        .select('*')
        .eq('fid', fid)
        .single();
      
      if (claimData) {
        // User has already claimed
        return { 
          isEligible: false, 
          hasClaimed: true, 
          hasAddedFrame: isFrameAdded, 
          hasNotifications 
        };
      }
      
      // Check eligibility criteria
      if (!isFrameAdded || !hasNotifications) {
        return { 
          isEligible: false, 
          hasClaimed: false, 
          hasAddedFrame: isFrameAdded, 
          hasNotifications 
        };
      }
      
      // User is eligible
      return { 
        isEligible: true, 
        hasClaimed: false, 
        hasAddedFrame: isFrameAdded, 
        hasNotifications 
      };
    } catch (error) {
      console.error('Error checking airdrop eligibility:', error);
      return { 
        isEligible: false, 
        hasClaimed: false, 
        hasAddedFrame: isFrameAdded, 
        hasNotifications 
      };
    }
  };
  
  // Use React Query for the eligibility check
  const { data, isLoading, refetch } = useQuery({
    queryKey: frameContext?.user?.fid ? airdropKeys.byFid(frameContext.user.fid) : ['airdrop-pending'],
    queryFn: checkEligibility,
    // Only enable query when we have frame context and wallet
    enabled: !!frameContext && !!walletAddress,
    // Stale time of 1 minute - eligibility doesn't change often
    staleTime: 60 * 1000,
    // Cache time of 10 minutes
    gcTime: 10 * 60 * 1000,
    // Don't refetch on mount if data is still fresh
    refetchOnMount: 'always',
  });
  
  // Mutation for recording claims
  const recordClaimMutation = useMutation({
    mutationFn: async (txHash?: string) => {
      if (!frameContext?.user?.fid || !walletAddress) {
        throw new Error('Missing required data');
      }
      
      const { error } = await supabase
        .from('airdrop_claims')
        .insert({
          fid: frameContext.user.fid,
          eth_address: walletAddress,
          amount: 1000, // 1,000 QR tokens
          tx_hash: txHash,
          success: !!txHash
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate and refetch the query
      if (frameContext?.user?.fid) {
        queryClient.invalidateQueries({ queryKey: airdropKeys.byFid(frameContext.user.fid) });
      }
    },
  });
  
  // Log state changes for debugging
  useEffect(() => {
    if (data) {
      console.log("AIRDROP ELIGIBILITY - State from React Query:", data);
    }
  }, [data]);
  
  return {
    isEligible: data?.isEligible || null,
    isLoading,
    hasClaimed: data?.hasClaimed || false,
    recordClaim: (txHash?: string) => recordClaimMutation.mutateAsync(txHash).then(() => true).catch(() => false),
    frameContext,
    walletAddress,
    hasAddedFrame: data?.hasAddedFrame || false,
    hasNotifications: data?.hasNotifications || false,
    checkFrameContext: refetch
  };
}