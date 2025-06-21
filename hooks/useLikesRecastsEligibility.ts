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
const likesRecastsKeys = {
  all: ['likesRecasts'] as const,
  byFid: (fid: number) => [...likesRecastsKeys.all, 'fid', fid] as const,
};

interface EligibilityData {
  isEligible: boolean;
  hasClaimedLikes: boolean;
  hasClaimedBoth: boolean;
  hasSignerApproval: boolean;
}

export function useLikesRecastsEligibility() {
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
    
    // Only poll every 30 seconds instead of 5 seconds
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
  const checkEligibility = async (): Promise<EligibilityData> => {
    if (!frameContext || !walletAddress) {
      return {
        isEligible: false,
        hasClaimedLikes: false,
        hasClaimedBoth: false,
        hasSignerApproval: false
      };
    }

    const fid = frameContext.user?.fid;
    
    if (!fid) {
      return {
        isEligible: false,
        hasClaimedLikes: false,
        hasClaimedBoth: false,
        hasSignerApproval: false
      };
    }
    
    try {
      // Check if user has already claimed
      const { data: claimData, error } = await supabase
        .from('likes_recasts_claims')
        .select('*')
        .eq('fid', fid);
      
      if (error) {
        console.error('Error checking claim status:', error);
        return {
          isEligible: false,
          hasClaimedLikes: false,
          hasClaimedBoth: false,
          hasSignerApproval: false
        };
      }
      
      let hasClaimedLikes = false;
      let hasClaimedBoth = false;
      
      if (claimData && claimData.length > 0) {
        const likesOnlyClaim = claimData.find(claim => claim.option_type === 'likes');
        const recastsOnlyClaim = claimData.find(claim => claim.option_type === 'recasts');
        const bothClaim = claimData.find(claim => claim.option_type === 'both');
        
        hasClaimedLikes = !!likesOnlyClaim;
        hasClaimedBoth = !!bothClaim;
        
        // If they've claimed both options, they're not eligible
        if (bothClaim) {
          return {
            isEligible: false,
            hasClaimedLikes,
            hasClaimedBoth,
            hasSignerApproval: false
          };
        }
        
        // If they've claimed both individual options, they're not eligible
        if (likesOnlyClaim && recastsOnlyClaim) {
          return {
            isEligible: false,
            hasClaimedLikes,
            hasClaimedBoth,
            hasSignerApproval: false
          };
        }
      }
      
      // Check for existing signer approval
      let hasSignerApproval = false;
      const { data: signerData, error: signerError } = await supabase
        .from('neynar_signers')
        .select('*')
        .eq('fid', fid)
        .eq('status', 'approved');
      
      if (!signerError && signerData && signerData.length > 0) {
        hasSignerApproval = true;
      }
      
      // User is eligible if they haven't claimed the 'both' option
      return {
        isEligible: true,
        hasClaimedLikes,
        hasClaimedBoth,
        hasSignerApproval
      };
    } catch (error) {
      console.error('Error checking likes/recasts eligibility:', error);
      return {
        isEligible: false,
        hasClaimedLikes: false,
        hasClaimedBoth: false,
        hasSignerApproval: false
      };
    }
  };
  
  // Use React Query for the eligibility check
  const { data, isLoading, refetch } = useQuery({
    queryKey: frameContext?.user?.fid ? likesRecastsKeys.byFid(frameContext.user.fid) : ['likesRecasts-pending'],
    queryFn: checkEligibility,
    // Only enable query when we have frame context and wallet
    enabled: !!frameContext && !!walletAddress,
    // Stale time of 2 minutes - permissions don't change often
    staleTime: 2 * 60 * 1000,
    // Cache time of 10 minutes
    gcTime: 10 * 60 * 1000,
  });
  
  // Mutation for recording claims
  const recordClaimMutation = useMutation({
    mutationFn: async ({ optionType, txHash }: { optionType: 'likes' | 'recasts' | 'both'; txHash?: string }) => {
      if (!frameContext?.user?.fid || !walletAddress) {
        throw new Error('Missing required data');
      }
      
      const amount = optionType === 'likes' ? 1000 : optionType === 'recasts' ? 1000 : 2000;
      
      const { error } = await supabase
        .from('likes_recasts_claims')
        .insert({
          fid: frameContext.user.fid,
          eth_address: walletAddress,
          option_type: optionType,
          amount: amount,
          tx_hash: txHash,
          success: !!txHash,
          username: frameContext.user.username || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate and refetch the query
      if (frameContext?.user?.fid) {
        queryClient.invalidateQueries({ queryKey: likesRecastsKeys.byFid(frameContext.user.fid) });
      }
    },
  });
  
  // Log state changes for debugging
  useEffect(() => {
    if (data) {
      console.log("LIKES/RECASTS ELIGIBILITY - State from React Query:", data);
    }
  }, [data]);
  
  return {
    isEligible: data?.isEligible || null,
    isLoading,
    hasClaimedLikes: data?.hasClaimedLikes || false,
    hasClaimedBoth: data?.hasClaimedBoth || false,
    hasClaimedEither: data?.hasClaimedLikes || data?.hasClaimedBoth || false,
    recordClaim: (optionType: 'likes' | 'recasts' | 'both', txHash?: string) => 
      recordClaimMutation.mutateAsync({ optionType, txHash }).then(() => true).catch(() => false),
    frameContext,
    walletAddress,
    hasSignerApproval: data?.hasSignerApproval || false,
    checkFrameContext: refetch
  };
}