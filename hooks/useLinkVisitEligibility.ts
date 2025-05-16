import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function useLinkVisitEligibility(auctionId: number) {
  const [hasClicked, setHasClicked] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Log state changes
  useEffect(() => {
    console.log("LINK VISIT ELIGIBILITY - State changed:");
    console.log("auctionId:", auctionId);
    console.log("hasClicked:", hasClicked);
    console.log("hasClaimed:", hasClaimed);
    console.log("isLoading:", isLoading);
    console.log("walletAddress:", walletAddress);
    console.log("frameContext username:", frameContext?.user?.username);
    console.log("frameContext fid:", frameContext?.user?.fid);
  }, [hasClicked, hasClaimed, isLoading, walletAddress, frameContext, auctionId]);
  
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
  
  // Get initial frame context and wallet, and poll for updates
  useEffect(() => {
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
  }, [checkFrameContext]);

  // Check link visit status based on frame context
  useEffect(() => {
    const checkVisitStatus = async () => {
      console.log("CHECKING LINK VISIT STATUS - Starting check");
      
      // If no frame context or no auction ID, can't check status
    if (!frameContext || !auctionId) {
        console.log("Missing frame context or auction ID");
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
        console.log("Checking database for link visit status");
        const { data, error } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('fid', fid)
        .eq('auction_id', auctionId)
          .maybeSingle();
      
        if (error && error.code !== 'PGRST116') {
        console.error('Error checking link visit status:', error);
      }
        
        if (data) {
          console.log("Visit status found:", {
            hasClicked: !!data.link_visited_at,
            hasClaimed: !!data.claimed_at,
            record: data
          });
          setHasClicked(!!data.link_visited_at);
          setHasClaimed(!!data.claimed_at);
        } else {
          // No record found, reset states
          console.log("No visit records found");
          setHasClicked(false);
          setHasClaimed(false);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking link visit status:', error);
      setIsLoading(false);
    }
    };

    checkVisitStatus();
  }, [frameContext, auctionId]);
  
  // Record claim in database
  const recordClaim = async (txHash?: string): Promise<boolean> => {
    if (!frameContext?.user?.fid || !walletAddress || !auctionId) return false;
    
    try {
      console.log("Recording claim in database:", {
        fid: frameContext.user.fid,
        auction_id: auctionId,
        txHash
      });
      
      const { error } = await supabase
        .from('link_visit_claims')
        .upsert({
          fid: frameContext.user.fid,
          auction_id: auctionId,
          eth_address: walletAddress,
          claimed_at: new Date().toISOString(),
          amount: 5000, // 5,000 QR tokens
          tx_hash: txHash,
          success: !!txHash,
          username: frameContext.user.username || null
        }, {
          onConflict: 'fid,auction_id'
        });
        
      if (error) {
        console.error("Error recording claim:", error);
        throw error;
      }
      
      // Update local state
      setHasClaimed(true);
      return true;
    } catch (error) {
      console.error('Error recording claim:', error);
      return false;
    }
  };

  // Record link click in database
  const recordClick = async (): Promise<boolean> => {
    if (!frameContext?.user?.fid || !auctionId) return false;
    
    try {
      console.log("Recording link click:", {
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
          eth_address: walletAddress || null,
          username: frameContext.user.username || null
        }, {
          onConflict: 'fid,auction_id'
        });
        
      if (error) {
        console.error("Error recording link click:", error);
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('Error recording click:', error);
      return false;
    }
  };
  
  // Manual refresh function
  const refreshStatus = useCallback(async () => {
    const context = await checkFrameContext();
    
    if (context?.user?.fid && auctionId) {
      console.log("Manual refresh for auction", auctionId);
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('fid', context.user.fid)
          .eq('auction_id', auctionId)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('Manual refresh error:', error);
        }
        
        if (data) {
          console.log("Manual refresh found record:", data);
          setHasClicked(!!data.link_visited_at);
          setHasClaimed(!!data.claimed_at);
        } else {
          console.log("Manual refresh found no record");
          setHasClicked(false);
          setHasClaimed(false);
        }
      } catch (error) {
        console.error('Manual refresh error:', error);
      } finally {
        setIsLoading(false);
    }
    }
  }, [checkFrameContext, auctionId]);
  
  return { 
    hasClicked, 
    hasClaimed,
    isLoading,
    recordClaim,
    recordClick,
    frameContext,
    walletAddress,
    checkFrameContext,
    refreshStatus
  };
} 