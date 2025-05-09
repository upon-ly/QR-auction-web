import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function useAirdropEligibility() {
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Log state changes
  useEffect(() => {
    console.log("ELIGIBILITY HOOK - State changed:");
    console.log("isEligible:", isEligible);
    console.log("isLoading:", isLoading);
    console.log("hasClaimed:", hasClaimed);
    console.log("walletAddress:", walletAddress);
    console.log("frameContext username:", frameContext?.user?.username);
    console.log("hasAddedFrame:", frameContext?.client?.added);
    console.log("hasNotifications:", !!frameContext?.client?.notificationDetails);
  }, [isEligible, isLoading, hasClaimed, walletAddress, frameContext]);
  
  // Function to refresh frame context (can be called repeatedly to check for changes)
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
      
      // Return the context for convenience
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
    
    // Set up an interval to check for updates - checking more frequently
    const intervalId = setInterval(() => {
      checkFrameContext();
    }, 3000); // Check every 3 seconds for faster response
    
    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [checkFrameContext]);

  // Check eligibility based on frame context
  useEffect(() => {
    const checkEligibility = async () => {
      console.log("CHECKING ELIGIBILITY - Starting check");
      
      // If no frame context or wallet, not eligible
      if (!frameContext || !walletAddress) {
        console.log("Missing frame context or wallet address");
        setIsLoading(false);
        setIsEligible(false);
        return;
      }

      const fid = frameContext.user?.fid;
      const username = frameContext.user?.username;
      const isFrameAdded = frameContext.client?.added;
      const hasNotifications = !!frameContext.client?.notificationDetails;
      
      console.log("ELIGIBILITY CHECK:", {
        fid,
        username,
        isFrameAdded,
        hasNotifications
      });
      
      if (!fid) {
        console.log("No FID found");
        setIsLoading(false);
        setIsEligible(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        // First check if user has already claimed - do this check first
        console.log("Checking database for previous claims");
        const { data: claimData } = await supabase
          .from('airdrop_claims')
          .select('*')
          .eq('fid', fid)
          .single();
          
        if (claimData) {
          // User has already claimed
          console.log("User has already claimed - not eligible");
          setHasClaimed(true);
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
        
        // Check if the frame has been added to the user's client
        if (!isFrameAdded) {
          console.log('User has not added the frame yet');
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
        
        // Check if notifications are enabled
        if (!hasNotifications) {
          console.log('User has not enabled notifications');
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
          
        // User is eligible (frame added and notifications enabled already checked above)
        console.log("User is eligible");
        setIsEligible(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking airdrop eligibility:', error);
        setIsEligible(false);
        setIsLoading(false);
      }
    };

    checkEligibility();
  }, [frameContext, walletAddress]);
  
  // Function to record claim in database
  const recordClaim = async (txHash?: string): Promise<boolean> => {
    if (!frameContext?.user?.fid || !walletAddress) return false;
    
    try {
      const { error } = await supabase
        .from('airdrop_claims')
        .insert({
          fid: frameContext.user.fid,
          eth_address: walletAddress,
          amount: 10000, // 10,000 QR tokens
          tx_hash: txHash,
          success: !!txHash
        });
        
      if (error) throw error;
      
      // Update local state
      setHasClaimed(true);
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
    hasClaimed,
    recordClaim,
    frameContext,
    walletAddress,
    hasAddedFrame: frameContext?.client?.added || false,
    hasNotifications: !!frameContext?.client?.notificationDetails,
    checkFrameContext // Expose this so it can be called to refresh status
  };
} 