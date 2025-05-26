import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function useLikesRecastsEligibility() {
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasClaimedLikes, setHasClaimedLikes] = useState(false);
  const [hasClaimedBoth, setHasClaimedBoth] = useState(false);
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasSignerApproval, setHasSignerApproval] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(0);
  const [hasCompletedInitialCheck, setHasCompletedInitialCheck] = useState(false);
  
  // Log state changes
  useEffect(() => {
    console.log("LIKES/RECASTS ELIGIBILITY - State changed:", {
      isEligible,
      isLoading,
      hasClaimedLikes,
      hasClaimedBoth,
      walletAddress: walletAddress ? `${walletAddress.slice(0,6)}...` : null,
      frameContextUsername: frameContext?.user?.username,
      hasSignerApproval
    });
  }, [isEligible, isLoading, hasClaimedLikes, hasClaimedBoth, walletAddress, frameContext, hasSignerApproval]);
  
  // Function to refresh frame context
  const checkFrameContext = useCallback(async () => {
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
      
      return context;
    } catch (error) {
      console.error('Error fetching frame context:', error);
      return null;
    }
  }, [walletAddress]);
  
  // Get initial frame context and wallet
  useEffect(() => {
    const initializeFrameContext = async () => {
      await checkFrameContext();
    };
    
    initializeFrameContext();
    
    // Set up an interval to check for updates
    const intervalId = setInterval(() => {
      checkFrameContext();
    }, 5000); // Check every 5 seconds (reduced frequency)
    
    return () => {
      clearInterval(intervalId);
    };
  }, [checkFrameContext]);

  // Check eligibility based on frame context
  useEffect(() => {
    const checkEligibility = async () => {
      // Skip if we've already completed the initial check
      if (hasCompletedInitialCheck) {
        console.log("SKIPPING eligibility check - already completed initial check");
        return;
      }
      
      // Debounce: don't check if we checked recently (within 2 seconds)
      const now = Date.now();
      if (now - lastCheckTime < 2000) {
        console.log("SKIPPING eligibility check - too recent");
        return;
      }
      
      console.log("CHECKING LIKES/RECASTS ELIGIBILITY - Starting check");
      setLastCheckTime(now);
      
      // If no frame context or wallet, not eligible
      if (!frameContext || !walletAddress) {
        console.log("Missing frame context or wallet address");
        setIsLoading(false);
        setIsEligible(false);
        return;
      }

      const fid = frameContext.user?.fid;
      const username = frameContext.user?.username;
      
      console.log("ELIGIBILITY CHECK:", { fid, username });
      
      if (!fid) {
        console.log("No FID found");
        setIsLoading(false);
        setIsEligible(false);
        setHasCompletedInitialCheck(true);
        return;
      }
      
      setIsLoading(true);
      
      try {
        // Check if user has already claimed for likes or both
        console.log("Checking database for previous claims");
        const { data: claimData, error } = await supabase
          .from('likes_recasts_claims')
          .select('*')
          .eq('fid', fid);
          
        if (error) {
          console.error('Error checking claim status:', error);
          setIsEligible(false);
          setIsLoading(false);
          setHasCompletedInitialCheck(true);
          return;
        }
        
        if (claimData && claimData.length > 0) {
          // Check what they've already claimed
          const likesOnlyClaim = claimData.find(claim => claim.option_type === 'likes');
          const bothClaim = claimData.find(claim => claim.option_type === 'both');
          
          setHasClaimedLikes(!!likesOnlyClaim);
          setHasClaimedBoth(!!bothClaim);
          
          // If they've claimed both options, they're not eligible
          if (bothClaim) {
            console.log("User has already claimed likes & recasts - not eligible");
            setIsEligible(false);
            setIsLoading(false);
            setHasCompletedInitialCheck(true);
            return;
          }
        }
        
        // Check if user has existing signer approval
        console.log("Checking for existing approved signer");
        const { data: signerData, error: signerError } = await supabase
          .from('neynar_signers')
          .select('*')
          .eq('fid', fid)
          .eq('status', 'approved');
          
        if (signerError) {
          console.error('Error checking signer status:', signerError);
          // Continue with check but assume no approval
          setHasSignerApproval(false);
        } else if (signerData && signerData.length > 0) {
          console.log("Found approved signer for user");
          setHasSignerApproval(true);
        } else {
          console.log("No approved signer found for user");
          setHasSignerApproval(false);
        }
          
        // User is eligible if they haven't claimed the 'both' option
        console.log("User is eligible for likes/recasts permissions");
        setIsEligible(true);
        setIsLoading(false);
        setHasCompletedInitialCheck(true);
      } catch (error) {
        console.error('Error checking likes/recasts eligibility:', error);
        setIsEligible(false);
        setIsLoading(false);
        setHasCompletedInitialCheck(true);
      }
    };

    checkEligibility();
  }, [frameContext, walletAddress, hasCompletedInitialCheck, lastCheckTime]);
  
  // Function to record claim in database
  const recordClaim = async (optionType: 'likes' | 'both', txHash?: string): Promise<boolean> => {
    if (!frameContext?.user?.fid || !walletAddress) return false;
    
    try {
      const amount = optionType === 'likes' ? 2000 : 10000;
      
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
      
      // Update local state
      if (optionType === 'likes') {
        setHasClaimedLikes(true);
      } else {
        setHasClaimedBoth(true);
      }
      setIsEligible(false);
      
      return true;
    } catch (error) {
      console.error('Error recording claim:', error);
      return false;
    }
  };
  
  return { 
    isEligible, 
    isLoading, 
    hasClaimedLikes,
    hasClaimedBoth,
    hasClaimedEither: hasClaimedLikes || hasClaimedBoth,
    recordClaim,
    frameContext,
    walletAddress,
    hasSignerApproval,
    checkFrameContext
  };
} 